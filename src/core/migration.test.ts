import { existsSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { createTestProject } from "../lib/test-setup.js"
import { readDocument } from "./docs.js"
import { findNodeById, scanNodes } from "./nodes.js"
import { applyTidyPlan, buildTidyPlan, isNoopPlan } from "./tidy.js"

/**
 * Zero-migration compatibility contract.
 *
 * Fixtures modeled on real pre-rework projects. The contract: the
 * scanner reads existing projects untouched, and one `pm tidy` run
 * converges them to the flat-model layout.
 */

const testProject = createTestProject("migration")

const PM_JSON_V2 = {
  directory: "docs",
  types: { feature: { tag: "feat" }, task: { tag: "task" } },
}

// A real-world legacy config — doctypes plus the one required
// addition, `directory` (the single manual migration step).
const LEGACY_PM_JSON = {
  $schema: "https://example.com/pm-project.schema.json",
  directory: "context/features",
  idMask: "000",
  doctypes: {
    feature: {
      tag: "feat",
      dir: "context/features",
      intermediateDir: true,
      requireParent: false,
    },
    spec: { tag: "spec", dir: ".", parent: "feature" },
    task: { tag: "task", dir: ".", parent: "spec" },
  },
}

// ---------------------------------------------------------------------------
// Legacy intermediateDir feature tree, specs and tasks colocated
// ---------------------------------------------------------------------------

function setupLegacyTree() {
  return testProject.setup({
    pmJson: LEGACY_PM_JSON,
    pmCurrent: 4,
    files: {
      "context/features/001.feat.catalog/001.feat.catalog.md": {
        title: "Catalog",
        status: "in-progress",
        created_on: "2026-03-01",
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
      // legacy bare-numeric parent ref (backwards compat)
      "context/features/003.feat.checkout/005.spec.payment.md": {
        parent: 3,
        title: "Payment",
        status: "new",
      },
    },
  })
}

describe("legacy intermediateDir tree", () => {
  it("scans untouched: legacy dirs become groups, docs keep IDs", () => {
    const { project } = setupLegacyTree()
    const scan = scanNodes(project)

    expect(scan.groups.map((g) => [g.id, g.slug, g.legacyTag])).toEqual([
      [1, "catalog", "feat"],
      [3, "checkout", "feat"],
    ])
    expect(scan.docs.map((d) => [d.id, d.tag, d.groupId])).toEqual([
      [1, "feat", 1],
      [2, "spec", 1],
      [4, "task", 1],
      [3, "feat", 3],
      [5, "spec", 3],
    ])
    expect(scan.warnings).toEqual([])
  })

  it("resolves shared doc/dir IDs to the doc", () => {
    const { project } = setupLegacyTree()
    const scan = scanNodes(project)
    expect(findNodeById(scan, 1)?.kind).toBe("doc")
    expect(findNodeById(scan, 3)?.kind).toBe("doc")
  })

  it("loads the legacy config with warnings, never errors", () => {
    const { project } = setupLegacyTree()
    expect(project.warnings.length).toBeGreaterThan(0)
    expect(Object.keys(project.types)).toEqual(["feature", "spec", "task"])
  })

  it("tidy converges: legacy dirs renumbered from maxId+1 and renamed tag-less, feature docs adopted, child refs normalized", async () => {
    const { project, dir } = setupLegacyTree()
    applyTidyPlan(await buildTidyPlan(project))

    const root = join(dir, "context/features")
    expect(existsSync(join(root, "006.catalog/001.feat.catalog.md"))).toBe(true)
    expect(existsSync(join(root, "007.checkout/003.feat.checkout.md"))).toBe(
      true,
    )
    expect(existsSync(join(root, "001.feat.catalog"))).toBe(false)

    // feature docs adopted by their renumbered groups
    expect(readDocument(project, 1)?.frontmatter.parent).toBe("006.catalog")
    expect(readDocument(project, 3)?.frontmatter.parent).toBe("007.checkout")
    // children keep pointing at the docs, refs healed to padded form
    expect(readDocument(project, 2)?.frontmatter.parent).toBe(
      "001.feat.catalog",
    )
    expect(readDocument(project, 4)?.frontmatter.parent).toBe(
      "002.spec.product-page",
    )
  })

  it("tidy normalizes bare-numeric parent refs to qualified doc refs", async () => {
    const { project } = setupLegacyTree()
    applyTidyPlan(await buildTidyPlan(project))
    expect(readDocument(project, 5)?.frontmatter.parent).toBe(
      "003.feat.checkout",
    )
  })

  it("a second tidy run right after the first is a strict no-op", async () => {
    const { project } = setupLegacyTree()
    applyTidyPlan(await buildTidyPlan(project))
    expect(isNoopPlan(await buildTidyPlan(project))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Documents outside the configured root (context/notes
// beside context/features) — the accepted migration cost
// ---------------------------------------------------------------------------

describe("notes outside the root", () => {
  it("does not see documents outside the configured directory", () => {
    const { project } = testProject.setup({
      pmJson: LEGACY_PM_JSON,
      files: {
        "context/features/001.feat.parser/001.feat.parser.md": {
          title: "Parser",
          status: "new",
        },
        "context/notes/002.note.encoding-gotchas.md": {
          title: "Encoding gotchas",
          status: "new",
        },
      },
    })
    const scan = scanNodes(project)
    // The note is invisible until moved into the root by hand — the
    // consciously accepted cost of the single-directory model.
    expect(scan.docs.map((d) => d.id)).toEqual([1])
  })
})

// ---------------------------------------------------------------------------
// Duplicate IDs across files — the tidy renumbering case
// ---------------------------------------------------------------------------

describe("duplicate doc IDs", () => {
  it("scans both duplicates; resolution order is deterministic by path", () => {
    const { project } = testProject.setup({
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
    const scan = scanNodes(project)
    expect(scan.docs.filter((d) => d.id === 1)).toHaveLength(2)
    expect(scan.groups.filter((g) => g.id === 1)).toHaveLength(2)
    // path order: alpha before beta
    expect(findNodeById(scan, 1)?.path).toMatch(/alpha/)
  })

  it("tidy keeps the first duplicate (path order) on the ID, renumbers the others; children follow via the slug-only hint", async () => {
    const { project } = testProject.setup({
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
    applyTidyPlan(await buildTidyPlan(project))

    const scan = scanNodes(project)
    const allIds = [...scan.docs, ...scan.groups].map((n) => n.id)
    expect(new Set(allIds).size).toBe(allIds.length)
    // alpha kept 1; beta was renumbered and its child followed
    expect(readDocument(project, 1)?.frontmatter.title).toBe("Alpha")
    const child = readDocument(project, 2)!
    expect(child.frontmatter.parent).toBe("003.feat.beta")
    expect(readDocument(project, 3)?.frontmatter.title).toBe("Beta")
  })

  // Member docs reference their group via parent:, so renumbering a
  // group rewrites their refs.
  it("tidy renumbers duplicate group directories and rewrites member refs by slug hint", async () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON_V2,
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
    applyTidyPlan(await buildTidyPlan(project))

    const scan = scanNodes(project)
    expect(scan.groups.map((g) => [g.id, g.slug])).toEqual([
      [2, "aa"],
      [5, "bb"],
    ])
    expect(readDocument(project, 3)?.frontmatter.parent).toBe("002.aa")
    expect(readDocument(project, 4)?.frontmatter.parent).toBe("005.bb")
  })
})

// ---------------------------------------------------------------------------
// v2-native layout — what a converged project looks like (steps 6–7)
// ---------------------------------------------------------------------------

describe("v2-native layout", () => {
  it("scans flat docs, groups, and group members", () => {
    const { project } = testProject.setup({
      pmJson: {
        directory: "project",
        types: {
          feature: { tag: "feat" },
          task: { tag: "task" },
          decision: { tag: "adr", doneStatuses: ["accepted", "rejected"] },
        },
      },
      dirs: ["project/001.backlog"],
      files: {
        "project/002.feat.search.md": { title: "Search", status: "new" },
        "project/003.adr.use-sqlite.md": {
          title: "Use SQLite",
          status: "accepted",
        },
        "project/001.backlog/004.task.spike.md": {
          parent: "1.backlog",
          title: "Spike",
          status: "new",
        },
      },
    })
    const scan = scanNodes(project)
    expect(project.warnings).toEqual([])
    expect(scan.warnings).toEqual([])
    expect(scan.groups.map((g) => [g.id, g.legacyTag])).toEqual([[1, null]])
    expect(scan.docs.map((d) => [d.id, d.tag, d.groupId])).toEqual([
      [4, "task", 1],
      [2, "feat", null],
      [3, "adr", null],
    ])
  })

  // The original todo also said "moves a parentless doc to the root" —
  // superseded: adoption covers every parentless doc the scanner can see
  // (root docs are already home; group docs get adopted, never evicted).
  it("tidy adopts a doc dropped into a group dir without a parent ref", async () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON_V2,
      files: {
        "docs/010.stuff/011.task.dropped.md": {
          title: "Dropped",
          status: "new",
        },
      },
    })
    applyTidyPlan(await buildTidyPlan(project))
    expect(readDocument(project, 11)?.frontmatter.parent).toBe("010.stuff")
  })

  it("tidy rewrites depends to qualified refs and warns without fixing on group entries", async () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON_V2,
      dirs: ["docs/010.stuff"],
      files: {
        "docs/001.task.dep.md": { title: "Dep", status: "done" },
        "docs/002.task.main.md": {
          title: "Main",
          status: "new",
          depends: [1, "10.stuff"],
        },
      },
    })
    const plan = await buildTidyPlan(project)
    expect(plan.warnings.join("\n")).toMatch(/group/i)
    applyTidyPlan(plan)
    expect(readDocument(project, 2)?.frontmatter.depends).toEqual([
      "001.task.dep",
      "10.stuff",
    ])
  })
})
