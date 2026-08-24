import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { createTestProject } from "../lib/test-setup.js"
import { readDocument } from "./docs.js"
import { scanNodes } from "./nodes.js"
import {
  applyTidyPlan,
  buildTidyPlan,
  isNoopPlan,
  type TidyPlan,
} from "./tidy.js"

const testProject = createTestProject("tidy")

const PM_JSON = {
  directory: "docs",
  types: {
    feature: { tag: "feat" },
    spec: { tag: "spec" },
    task: { tag: "task" },
  },
}

const LEGACY_PM_JSON = {
  directory: "context/features",
  doctypes: {
    feature: { tag: "feat", dir: "context/features", intermediateDir: true },
    spec: { tag: "spec", dir: ".", parent: "feature" },
    task: { tag: "task", dir: ".", parent: "spec" },
  },
}

function editFor(plan: TidyPlan, path: string) {
  return plan.edits.find((e) => e.path === path)
}

// ---------------------------------------------------------------------------
// Legacy conversion
// ---------------------------------------------------------------------------

describe("legacy intermediateDir conversion", () => {
  function setupLegacy() {
    const setup = testProject.setup({
      pmJson: LEGACY_PM_JSON,
      files: {
        "context/features/001.feat.catalog/001.feat.catalog.md": {
          title: "Catalog",
          status: "in-progress",
        },
        "context/features/001.feat.catalog/002.spec.product-page.md": {
          parent: "1.feat.catalog",
          title: "Product page",
          status: "done",
        },
        "context/features/001.feat.catalog/004.task.fix-images.md": {
          parent: "2.spec.product-page",
          title: "Fix images",
          status: "new",
        },
        "context/features/003.feat.checkout/003.feat.checkout.md": {
          title: "Checkout",
          status: "new",
        },
        "context/features/003.feat.checkout/005.spec.payment.md": {
          parent: 3,
          title: "Payment",
          status: "new",
        },
      },
    })
    // an untracked asset must survive the directory rename
    writeFileSync(
      join(setup.dir, "context/features/001.feat.catalog/mockup.png"),
      "binary",
    )
    return setup
  }

  it("renumbers colliding legacy dirs and renames them tag-less", async () => {
    const { project, dir } = setupLegacy()
    const plan = await buildTidyPlan(project)

    const root = join(dir, "context/features")
    expect(plan.groupRenames.map((r) => [r.from, r.to, r.newId])).toEqual([
      [join(root, "001.feat.catalog"), join(root, "006.catalog"), 6],
      [join(root, "003.feat.checkout"), join(root, "007.checkout"), 7],
    ])
    expect(plan.renumberings.map((r) => [r.node.id, r.newId])).toEqual([
      [1, 6],
      [3, 7],
    ])
    // directories renumber, files never do — no doc moves at all
    expect(plan.moves).toEqual([])
  })

  it("adopts the feature docs into their renumbered groups and normalizes child refs", async () => {
    const { project, dir } = setupLegacy()
    const plan = await buildTidyPlan(project)
    const root = join(dir, "context/features")

    expect(
      editFor(plan, join(root, "001.feat.catalog/001.feat.catalog.md"))
        ?.updates,
    ).toEqual({ parent: "006.catalog" })
    expect(
      editFor(plan, join(root, "003.feat.checkout/003.feat.checkout.md"))
        ?.updates,
    ).toEqual({ parent: "007.checkout" })
    // qualified ref healed to padded form
    expect(
      editFor(plan, join(root, "001.feat.catalog/002.spec.product-page.md"))
        ?.updates,
    ).toEqual({ parent: "001.feat.catalog" })
    expect(
      editFor(plan, join(root, "001.feat.catalog/004.task.fix-images.md"))
        ?.updates,
    ).toEqual({ parent: "002.spec.product-page" })
    // bare numeric expanded
    expect(
      editFor(plan, join(root, "003.feat.checkout/005.spec.payment.md"))
        ?.updates,
    ).toEqual({ parent: "003.feat.checkout" })
  })

  it("applies and converges: renamed dirs, preserved assets, resolvable refs, then a strict no-op", async () => {
    const { project, dir } = setupLegacy()
    applyTidyPlan(await buildTidyPlan(project))

    const root = join(dir, "context/features")
    expect(existsSync(join(root, "006.catalog/001.feat.catalog.md"))).toBe(true)
    expect(existsSync(join(root, "006.catalog/mockup.png"))).toBe(true)
    expect(existsSync(join(root, "001.feat.catalog"))).toBe(false)

    const scan = scanNodes(project)
    expect(scan.groups.map((g) => [g.id, g.slug, g.legacyTag])).toEqual([
      [6, "catalog", null],
      [7, "checkout", null],
    ])
    expect(readDocument(project, 1)?.frontmatter.parent).toBe("006.catalog")
    expect(readDocument(project, 5)?.frontmatter.parent).toBe(
      "003.feat.checkout",
    )

    const second = await buildTidyPlan(project)
    expect(isNoopPlan(second)).toBe(true)
    expect(second.edits).toEqual([])
  })

  it("keeps the ID of a legacy dir that collides with nothing", async () => {
    const { project, dir } = testProject.setup({
      pmJson: LEGACY_PM_JSON,
      files: {
        "context/features/002.feat.stuff/005.task.inside.md": {
          title: "Inside",
          status: "new",
        },
      },
    })
    const plan = await buildTidyPlan(project)
    const root = join(dir, "context/features")
    expect(plan.groupRenames.map((r) => [r.from, r.to])).toEqual([
      [join(root, "002.feat.stuff"), join(root, "002.stuff")],
    ])
    expect(plan.renumberings).toEqual([])
    expect(
      editFor(plan, join(root, "002.feat.stuff/005.task.inside.md"))?.updates,
    ).toEqual({ parent: "002.stuff" })
  })
})

// ---------------------------------------------------------------------------
// Duplicate IDs
// ---------------------------------------------------------------------------

describe("duplicate IDs", () => {
  it("first doc in path order keeps the ID; other docs then groups renumber", async () => {
    const { project, dir } = testProject.setup({
      pmJson: LEGACY_PM_JSON,
      files: {
        "context/features/001.feat.alpha/001.feat.alpha.md": {
          title: "Alpha",
          status: "new",
        },
        "context/features/001.feat.beta/001.feat.beta.md": {
          title: "Beta",
          status: "new",
        },
        "context/features/001.feat.beta/002.spec.beta-spec.md": {
          parent: "1.feat.beta",
          title: "Beta spec",
          status: "new",
        },
      },
    })
    const plan = await buildTidyPlan(project)
    const root = join(dir, "context/features")

    // maxId is 2: beta doc → 3, then groups alpha → 4, beta → 5
    expect(
      plan.renumberings.map((r) => [r.node.kind, r.node.id, r.newId]),
    ).toEqual([
      ["doc", 1, 3],
      ["group", 1, 4],
      ["group", 1, 5],
    ])
    expect(plan.groupRenames.map((r) => [r.from, r.to])).toEqual([
      [join(root, "001.feat.alpha"), join(root, "004.alpha")],
      [join(root, "001.feat.beta"), join(root, "005.beta")],
    ])
    // the renumbered beta doc moves to its new filename, inside the
    // already-renamed dir
    expect(plan.moves.map((m) => [m.from, m.to])).toEqual([
      [
        join(root, "005.beta/001.feat.beta.md"),
        join(root, "005.beta/003.feat.beta.md"),
      ],
    ])
    // the child resolves its parent by slug hint and follows the new ID
    expect(
      editFor(plan, join(root, "001.feat.beta/002.spec.beta-spec.md"))?.updates
        .parent,
    ).toBe("003.feat.beta")

    applyTidyPlan(plan)
    const scan = scanNodes(project)
    const allIds = [...scan.docs, ...scan.groups].map((n) => n.id).sort()
    expect(new Set(allIds).size).toBe(allIds.length)
    expect(readDocument(project, 2)?.frontmatter.parent).toBe("003.feat.beta")
    expect(isNoopPlan(await buildTidyPlan(project))).toBe(true)
  })

  it("resolves an ambiguous parent through the prompt", async () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/001.feat.alpha.md": { title: "Alpha", status: "new" },
        "docs/001.feat.beta.md": { title: "Beta", status: "new" },
        "docs/002.task.child.md": { parent: 1, title: "Child", status: "new" },
      },
    })
    const prompt = vi.fn(async (_child, candidates) => {
      return (
        candidates.find((c) => c.kind === "doc" && c.slug === "beta") ?? null
      )
    })
    const plan = await buildTidyPlan(project, prompt)

    expect(prompt).toHaveBeenCalledOnce()
    const [child, candidates] = prompt.mock.calls[0]
    expect(child.id).toBe(2)
    expect(candidates.map((c: { slug: string }) => c.slug)).toEqual([
      "alpha",
      "beta",
    ])
    const childEdit = plan.edits.find((e) =>
      e.path.endsWith("002.task.child.md"),
    )
    expect(childEdit?.updates.parent).toBe("003.feat.beta")
  })

  it("leaves an ambiguous ref untouched with a warning when unresolved", async () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/001.feat.alpha.md": { title: "Alpha", status: "new" },
        "docs/001.feat.beta.md": { title: "Beta", status: "new" },
        "docs/002.task.child.md": { parent: 1, title: "Child", status: "new" },
      },
    })
    const plan = await buildTidyPlan(project)
    expect(
      plan.edits.find((e) => e.path.endsWith("002.task.child.md")),
    ).toBeUndefined()
    expect(plan.warnings.join("\n")).toMatch(/ambiguous/i)

    const promptNull = vi.fn(async () => null)
    const plan2 = await buildTidyPlan(project, promptNull)
    expect(promptNull).toHaveBeenCalledOnce()
    expect(plan2.warnings.join("\n")).toMatch(/ambiguous/i)
  })

  it("renumbers duplicate groups; members follow their group by slug hint", async () => {
    const { project, dir } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/002.aa/003.task.a.md": {
          parent: "2.aa",
          title: "A",
          status: "new",
        },
        "docs/002.bb/004.task.b.md": {
          parent: "2.bb",
          title: "B",
          status: "new",
        },
      },
    })
    const plan = await buildTidyPlan(project)
    const root = join(dir, "docs")

    expect(plan.renumberings.map((r) => [r.node.slug, r.newId])).toEqual([
      ["bb", 5],
    ])
    expect(plan.groupRenames.map((r) => [r.from, r.to])).toEqual([
      [join(root, "002.bb"), join(root, "005.bb")],
    ])
    expect(
      editFor(plan, join(root, "002.bb/004.task.b.md"))?.updates.parent,
    ).toBe("005.bb")
    expect(editFor(plan, join(root, "002.aa/003.task.a.md"))?.updates).toEqual({
      parent: "002.aa",
    })

    applyTidyPlan(plan)
    expect(isNoopPlan(await buildTidyPlan(project))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// depends
// ---------------------------------------------------------------------------

describe("depends rewriting", () => {
  it("rewrites resolvable entries to canonical refs; warns and keeps the rest", async () => {
    const { project, dir } = testProject.setup({
      pmJson: PM_JSON,
      dirs: ["docs/010.stuff"],
      files: {
        "docs/001.task.dep.md": { title: "Dep", status: "done" },
        "docs/002.task.main.md": {
          title: "Main",
          status: "new",
          depends: [1, "10.stuff", 99, "junk"],
        },
      },
    })
    const plan = await buildTidyPlan(project)
    const edit = editFor(plan, join(dir, "docs/002.task.main.md"))
    expect(edit?.updates.depends).toEqual([
      "001.task.dep",
      "10.stuff",
      99,
      "junk",
    ])
    expect(plan.warnings).toHaveLength(3)
    const combined = plan.warnings.join("\n")
    expect(combined).toMatch(/group/i)
    expect(combined).toMatch(/99/)
    expect(combined).toMatch(/junk/)
  })

  it("follows renumbered targets using the slug hint", async () => {
    const { project, dir } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/001.feat.alpha.md": { title: "Alpha", status: "new" },
        "docs/001.feat.beta.md": { title: "Beta", status: "new" },
        "docs/002.task.child.md": {
          title: "Child",
          status: "new",
          depends: ["1.feat.beta"],
        },
      },
    })
    const plan = await buildTidyPlan(project)
    const edit = editFor(plan, join(dir, "docs/002.task.child.md"))
    expect(edit?.updates.depends).toEqual(["003.feat.beta"])
  })

  it("leaves an already-canonical depends list alone", async () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/001.task.dep.md": { title: "Dep", status: "done" },
        "docs/002.task.main.md": {
          title: "Main",
          status: "new",
          depends: ["001.task.dep"],
        },
      },
    })
    const plan = await buildTidyPlan(project)
    expect(plan.edits).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Adoption and placement
// ---------------------------------------------------------------------------

describe("adoption and placement", () => {
  it("adopts a parentless doc found inside a group", async () => {
    const { project, dir } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/010.stuff/011.task.spike.md": { title: "Spike", status: "new" },
      },
    })
    const plan = await buildTidyPlan(project)
    expect(
      editFor(plan, join(dir, "docs/010.stuff/011.task.spike.md"))?.updates,
    ).toEqual({ parent: "010.stuff" })
    expect(plan.moves).toEqual([])
  })

  it("moves a doc to its parent's directory and heals slug drift", async () => {
    const { project, dir } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/010.stuff/002.feat.auth.md": {
          parent: "10.stuff",
          title: "Auth",
          status: "new",
        },
        "docs/003.task.login.md": {
          parent: "2.feat.auth",
          title: "Login",
          status: "new",
        },
        "docs/004.task.old-name.md": { title: "Fresh Name", status: "new" },
      },
    })
    const plan = await buildTidyPlan(project)
    expect(plan.moves.map((m) => [m.from, m.to])).toEqual([
      [
        join(dir, "docs/003.task.login.md"),
        join(dir, "docs/010.stuff/003.task.login.md"),
      ],
      [
        join(dir, "docs/004.task.old-name.md"),
        join(dir, "docs/004.task.fresh-name.md"),
      ],
    ])

    applyTidyPlan(plan)
    expect(existsSync(join(dir, "docs/010.stuff/003.task.login.md"))).toBe(true)
    expect(isNoopPlan(await buildTidyPlan(project))).toBe(true)
  })

  it("leaves a doc with an unresolvable parent in place, with a warning", async () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/001.task.orphan.md": {
          parent: "99.feat.gone",
          title: "Orphan",
          status: "new",
        },
      },
    })
    const plan = await buildTidyPlan(project)
    expect(plan.edits).toEqual([])
    expect(plan.moves).toEqual([])
    expect(plan.warnings.join("\n")).toMatch(/99/)
  })

  it("is a no-op on a clean v2 project", async () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/010.stuff/002.feat.auth.md": {
          parent: "010.stuff",
          title: "Auth",
          status: "new",
        },
        "docs/010.stuff/003.task.login.md": {
          parent: "002.feat.auth",
          title: "Login",
          status: "new",
        },
        "docs/004.task.free.md": { title: "Free", status: "new" },
      },
    })
    const plan = await buildTidyPlan(project)
    expect(isNoopPlan(plan)).toBe(true)
    expect(plan.warnings).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Apply-order integration: edits before renames before moves
// ---------------------------------------------------------------------------

describe("apply integration", () => {
  it("converges a project needing renames, edits, and moves at once", async () => {
    const { project, dir } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        // legacy-named dir colliding with the doc inside it
        "docs/001.feat.core/001.feat.core.md": {
          title: "Core",
          status: "new",
        },
        // a stray child of the core doc, misplaced at root
        "docs/002.task.wire.md": {
          parent: "1.feat.core",
          title: "Wire",
          status: "new",
        },
      },
    })
    applyTidyPlan(await buildTidyPlan(project))

    const scan = scanNodes(project)
    expect(scan.groups.map((g) => [g.id, g.slug, g.legacyTag])).toEqual([
      [3, "core", null],
    ])
    expect(readDocument(project, 1)?.frontmatter.parent).toBe("003.core")
    expect(readDocument(project, 2)?.frontmatter.parent).toBe("001.feat.core")
    expect(existsSync(join(dir, "docs/003.core/002.task.wire.md"))).toBe(true)
    expect(isNoopPlan(await buildTidyPlan(project))).toBe(true)
  })

  it("reads file content after edits without breaking bodies", async () => {
    const { project, dir } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/010.stuff/011.task.spike.md": { title: "Spike", status: "new" },
      },
    })
    const path = join(dir, "docs/010.stuff/011.task.spike.md")
    writeFileSync(path, `${readFileSync(path, "utf-8")}\n## Notes\n\nBody.\n`)

    applyTidyPlan(await buildTidyPlan(project))
    const content = readFileSync(path, "utf-8")
    expect(content).toContain("parent: 010.stuff")
    expect(content).toContain("Body.")
  })
})
