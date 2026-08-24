import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { createTestProject } from "../lib/test-setup.js"
import {
  computeExpectedPath,
  createDocument,
  editDocument,
  loadDocInfo,
  markBlocked,
  markDone,
  readDocument,
  showNode,
  slugify,
} from "./docs.js"
import { scanNodes } from "./nodes.js"

const testProject = createTestProject("docs")

const PM_JSON = {
  directory: "docs",
  types: {
    feature: { tag: "feat" },
    task: { tag: "task" },
    decision: {
      tag: "adr",
      defaultStatus: "draft",
      doneStatuses: ["accepted", "rejected"],
    },
  },
}

// ---------------------------------------------------------------------------
// createDocument
// ---------------------------------------------------------------------------

describe("createDocument", () => {
  it("creates a root doc with padded filename and default frontmatter", () => {
    const { project, dir } = testProject.setup({
      pmJson: PM_JSON,
      dirs: ["docs"],
    })
    const result = createDocument(project, {
      type: "feature",
      title: "User Auth",
    })
    expect(result.id).toBe(1)
    expect(result.type.name).toBe("feature")
    expect(result.path).toBe(join(dir, "docs", "001.feat.user-auth.md"))
    expect(existsSync(result.path)).toBe(true)

    const doc = readDocument(project, 1)!
    expect(doc.frontmatter.title).toBe("User Auth")
    expect(doc.frontmatter.status).toBe("new")
    expect(doc.frontmatter.created_on).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(doc.frontmatter.parent).toBeUndefined()
  })

  it("takes the next ID from the shared doc/group sequence", () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      dirs: ["docs/005.big-group"],
      files: { "docs/002.feat.a.md": { title: "A", status: "new" } },
    })
    const result = createDocument(project, { type: "task", title: "Next" })
    expect(result.id).toBe(6)
  })

  it("accepts the tag as well as the type name", () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      dirs: ["docs"],
    })
    expect(
      createDocument(project, { type: "feat", title: "A" }).type.name,
    ).toBe("feature")
    expect(createDocument(project, { type: "task", title: "B" }).type.tag).toBe(
      "task",
    )
  })

  it("throws on unknown type and empty title", () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      dirs: ["docs"],
    })
    expect(() => createDocument(project, { type: "nope", title: "A" })).toThrow(
      /Unknown type "nope"/,
    )
    expect(() =>
      createDocument(project, { type: "feat", title: "   " }),
    ).toThrow(/Title must not be empty/)
  })

  it("colocates with a parent doc and writes a qualified padded ref", () => {
    const { project, dir } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/010.stuff/002.feat.auth.md": { title: "Auth", status: "new" },
      },
    })
    const result = createDocument(project, {
      type: "task",
      title: "Login form",
      parentId: 2,
    })
    expect(result.path).toBe(
      join(dir, "docs", "010.stuff", "011.task.login-form.md"),
    )
    const doc = readDocument(project, 11)!
    expect(doc.frontmatter.parent).toBe("002.feat.auth")
  })

  it("places inside a parent group and writes a group ref", () => {
    const { project, dir } = testProject.setup({
      pmJson: PM_JSON,
      dirs: ["docs/003.backlog"],
    })
    const result = createDocument(project, {
      type: "task",
      title: "Spike",
      parentId: 3,
    })
    expect(result.path).toBe(
      join(dir, "docs", "003.backlog", "004.task.spike.md"),
    )
    const doc = readDocument(project, 4)!
    expect(doc.frontmatter.parent).toBe("003.backlog")
  })

  it("throws when the parent ID resolves to nothing", () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      dirs: ["docs"],
    })
    expect(() =>
      createDocument(project, { type: "feat", title: "A", parentId: 99 }),
    ).toThrow(/Parent 99 not found/)
  })

  it("honours explicit status, per-type default status, and setProperties", () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      dirs: ["docs"],
    })
    const a = createDocument(project, {
      type: "feat",
      title: "A",
      status: "in-progress",
    })
    expect(readDocument(project, a.id)!.frontmatter.status).toBe("in-progress")

    const b = createDocument(project, { type: "adr", title: "B" })
    expect(readDocument(project, b.id)!.frontmatter.status).toBe("draft")

    const c = createDocument(project, {
      type: "feat",
      title: "C",
      setProperties: { assignee: "lud" },
    })
    expect(readDocument(project, c.id)!.frontmatter.assignee).toBe("lud")
  })
})

// ---------------------------------------------------------------------------
// readDocument / loadDocInfo
// ---------------------------------------------------------------------------

describe("readDocument", () => {
  it("reads frontmatter by ID, doc wins over group on shared IDs", () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/001.feat.auth/001.feat.auth.md": { title: "Auth", status: "new" },
      },
    })
    const doc = readDocument(project, 1)!
    expect(doc.kind).toBe("doc")
    expect(doc.frontmatter.title).toBe("Auth")
  })

  it("returns null for unknown IDs and for group IDs", () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      dirs: ["docs/007.backlog"],
    })
    expect(readDocument(project, 99)).toBeNull()
    expect(readDocument(project, 7)).toBeNull()
  })

  it("loadDocInfo preserves scan fields", () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/010.stuff/011.task.a.md": { title: "A", status: "new" },
      },
    })
    const scan = scanNodes(project)
    const info = loadDocInfo(scan.docs[0])
    expect(info.groupId).toBe(10)
    expect(info.frontmatter.title).toBe("A")
  })
})

// ---------------------------------------------------------------------------
// showNode
// ---------------------------------------------------------------------------

describe("showNode", () => {
  it("shows a doc with its parent chain (root first) and children", () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/010.stuff/002.feat.auth.md": {
          parent: "10.stuff",
          title: "Auth",
          status: "new",
        },
        "docs/010.stuff/003.task.login.md": {
          parent: "2.feat.auth",
          title: "Login",
          status: "new",
        },
        "docs/010.stuff/004.task.logout.md": {
          parent: "2.feat.auth",
          title: "Logout",
          status: "new",
        },
      },
    })
    const result = showNode(project, 2)
    expect(result?.kind).toBe("doc")
    if (result?.kind !== "doc") return
    expect(result.document.id).toBe(2)
    expect(result.parents.map((p) => p.id)).toEqual([10])
    expect(result.parents[0].kind).toBe("group")
    expect(result.children.map((c) => c.id)).toEqual([3, 4])

    const leaf = showNode(project, 3)
    if (leaf?.kind !== "doc") throw new Error("expected doc")
    expect(leaf.parents.map((p) => p.id)).toEqual([10, 2])
  })

  it("shows a group with its member children", () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/010.stuff/011.task.a.md": {
          parent: "10.stuff",
          title: "A",
          status: "new",
        },
        "docs/012.feat.other.md": { title: "Other", status: "new" },
      },
    })
    const result = showNode(project, 10)
    expect(result?.kind).toBe("group")
    if (result?.kind !== "group") return
    expect(result.group.slug).toBe("stuff")
    expect(result.children.map((c) => c.id)).toEqual([11])
  })

  it("reports a missing parent and returns null for unknown IDs", () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/001.feat.orphan.md": {
          parent: "99.feat.gone",
          title: "Orphan",
          status: "new",
        },
      },
    })
    const result = showNode(project, 1)
    if (result?.kind !== "doc") throw new Error("expected doc")
    expect(result.missingParent).toBe(99)
    expect(result.parents).toEqual([])

    expect(showNode(project, 42)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// editDocument
// ---------------------------------------------------------------------------

describe("editDocument", () => {
  it("setParent writes a qualified ref without moving the file", () => {
    const { project, dir } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/001.feat.auth.md": { title: "Auth", status: "new" },
        "docs/002.task.login.md": { title: "Login", status: "new" },
      },
    })
    const { document, renamed } = editDocument(project, 2, { setParent: 1 })
    expect(document.frontmatter.parent).toBe("001.feat.auth")
    expect(renamed).toBeUndefined()
    expect(existsSync(join(dir, "docs", "002.task.login.md"))).toBe(true)
  })

  it("setParent accepts a group ID", () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      dirs: ["docs/010.stuff"],
      files: {
        "docs/002.task.login.md": { title: "Login", status: "new" },
      },
    })
    const { document } = editDocument(project, 2, { setParent: 10 })
    expect(document.frontmatter.parent).toBe("010.stuff")
  })

  it("setParent throws on unknown IDs", () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      files: { "docs/001.feat.a.md": { title: "A", status: "new" } },
    })
    expect(() => editDocument(project, 1, { setParent: 99 })).toThrow(
      /Parent 99 not found/,
    )
  })

  it("setType renames the tag segment in place, by name or tag", () => {
    const { project, dir } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/010.stuff/002.feat.auth.md": { title: "Auth", status: "new" },
      },
    })
    const { renamed } = editDocument(project, 2, { setType: "task" })
    expect(renamed).toEqual({
      from: join(dir, "docs", "010.stuff", "002.feat.auth.md"),
      to: join(dir, "docs", "010.stuff", "002.task.auth.md"),
    })
    expect(existsSync(renamed!.to)).toBe(true)
    expect(existsSync(renamed!.from)).toBe(false)

    const back = editDocument(project, 2, { setType: "feature" })
    expect(back.renamed!.to).toMatch(/002\.feat\.auth\.md$/)
    expect(() => editDocument(project, 2, { setType: "nope" })).toThrow(
      /Unknown type "nope"/,
    )
  })

  it("setProperties merges frontmatter and preserves the body", () => {
    const { project, dir } = testProject.setup({
      pmJson: PM_JSON,
      files: { "docs/001.feat.a.md": { title: "A", status: "new" } },
    })
    const path = join(dir, "docs", "001.feat.a.md")
    writeFileSync(
      path,
      `${readFileSync(path, "utf-8")}\n## Notes\n\nBody text.\n`,
    )

    const { document } = editDocument(project, 1, {
      setProperties: { status: "in-progress", assignee: "lud" },
    })
    expect(document.frontmatter.status).toBe("in-progress")
    expect(document.frontmatter.assignee).toBe("lud")
    expect(document.frontmatter.title).toBe("A")
    expect(readFileSync(path, "utf-8")).toContain("Body text.")
  })

  it("rejects a blank title", () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      files: { "docs/001.feat.a.md": { title: "A", status: "new" } },
    })
    expect(() =>
      editDocument(project, 1, { setProperties: { title: " " } }),
    ).toThrow(/Title must not be empty/)
  })

  it("updateSlug renames to match the title and moves to the expected dir", () => {
    const { project, dir } = testProject.setup({
      pmJson: PM_JSON,
      dirs: ["docs/010.stuff"],
      files: {
        "docs/002.task.old-name.md": {
          parent: "10.stuff",
          title: "Fresh Name",
          status: "new",
        },
      },
    })
    const { renamed } = editDocument(project, 2, { updateSlug: true })
    expect(renamed!.to).toBe(
      join(dir, "docs", "010.stuff", "002.task.fresh-name.md"),
    )
    expect(existsSync(renamed!.to)).toBe(true)
    expect(existsSync(join(dir, "docs", "002.task.old-name.md"))).toBe(false)
  })

  it("throws when the document does not exist", () => {
    const { project } = testProject.setup({ pmJson: PM_JSON, dirs: ["docs"] })
    expect(() => editDocument(project, 5, {})).toThrow(/Document 5 not found/)
  })

  it("setType composes with updateSlug: one rename to the new tag, new slug, expected dir", () => {
    const { project, dir } = testProject.setup({
      pmJson: PM_JSON,
      dirs: ["docs/010.stuff"],
      files: {
        "docs/002.feat.old-name.md": {
          parent: "10.stuff",
          title: "Fresh Name",
          status: "new",
        },
      },
    })
    const { renamed } = editDocument(project, 2, {
      setType: "task",
      updateSlug: true,
    })
    expect(renamed).toEqual({
      from: join(dir, "docs", "002.feat.old-name.md"),
      to: join(dir, "docs", "010.stuff", "002.task.fresh-name.md"),
    })
    expect(existsSync(renamed!.to)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// markDone / markBlocked
// ---------------------------------------------------------------------------

describe("markDone", () => {
  it("uses the type's first done status, or the global one for unknown tags", () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/001.adr.choice.md": { title: "Choice", status: "draft" },
        "docs/002.wild.thing.md": { title: "Thing", status: "new" },
      },
    })
    expect(markDone(project, 1).document.frontmatter.status).toBe("accepted")
    expect(markDone(project, 2).document.frontmatter.status).toBe("done")
  })

  it("unblocks documents blocked by the completed one", () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/001.feat.a.md": { title: "A", status: "in-progress" },
        "docs/002.task.b.md": {
          title: "B",
          status: "blocked",
          blocked_by: "001.feat.a",
        },
        "docs/003.task.c.md": {
          title: "C",
          status: "blocked",
          blocked_by: 1,
        },
        "docs/004.task.d.md": {
          title: "D",
          status: "blocked",
          blocked_by: "099.feat.other",
        },
      },
    })
    const result = markDone(project, 1)
    expect(result.unblocked.map((d) => d.id).sort()).toEqual([2, 3])
    const b = readDocument(project, 2)!
    expect(b.frontmatter.status).toBe("new")
    expect(b.frontmatter.blocked_by).toBeUndefined()
    expect(readDocument(project, 4)!.frontmatter.status).toBe("blocked")
  })

  it("throws for groups and unknown IDs", () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      dirs: ["docs/010.stuff"],
    })
    expect(() => markDone(project, 10)).toThrow(/group/i)
    expect(() => markDone(project, 99)).toThrow(/Document 99 not found/)
  })
})

describe("markBlocked", () => {
  it("sets the blocked status and a qualified blocked_by ref", () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/001.feat.a.md": { title: "A", status: "new" },
        "docs/002.task.b.md": { title: "B", status: "new" },
      },
    })
    const doc = markBlocked(project, 2, { blockedBy: 1 })
    expect(doc.frontmatter.status).toBe("blocked")
    expect(doc.frontmatter.blocked_by).toBe("001.feat.a")
  })

  it("accepts a group as blocker and works without one", () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      dirs: ["docs/010.stuff"],
      files: { "docs/002.task.b.md": { title: "B", status: "new" } },
    })
    expect(
      markBlocked(project, 2, { blockedBy: 10 }).frontmatter.blocked_by,
    ).toBe("010.stuff")
    expect(markBlocked(project, 2).frontmatter.status).toBe("blocked")
  })

  it("throws on unknown blocker", () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      files: { "docs/002.task.b.md": { title: "B", status: "new" } },
    })
    expect(() => markBlocked(project, 2, { blockedBy: 77 })).toThrow(
      /Blocking node 77 not found/,
    )
  })

  it("throws when the target document does not exist", () => {
    const { project } = testProject.setup({ pmJson: PM_JSON, dirs: ["docs"] })
    expect(() => markBlocked(project, 42)).toThrow(/Document 42 not found/)
  })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

describe("slugify", () => {
  it("lowercases, dashes non-alphanumerics, trims dashes", () => {
    expect(slugify("User Auth")).toBe("user-auth")
    expect(slugify("  Fix: the (weird) bug!  ")).toBe("fix-the-weird-bug")
    expect(slugify("Émigré café")).toBe("migr-caf")
  })
})

describe("computeExpectedPath", () => {
  it("follows the placement rules: root, parent doc, parent group", () => {
    const { project, dir } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/001.feat.root.md": { title: "Root", status: "new" },
        "docs/010.stuff/002.feat.inside.md": {
          parent: "10.stuff",
          title: "Inside",
          status: "new",
        },
        "docs/003.task.child.md": {
          parent: "2.feat.inside",
          title: "Child",
          status: "new",
        },
      },
    })
    const scan = scanNodes(project)
    const byId = (id: number) =>
      loadDocInfo(scan.docs.find((d) => d.id === id)!)

    expect(computeExpectedPath(project, byId(1), scan)).toBe(
      join(dir, "docs", "001.feat.root.md"),
    )
    expect(computeExpectedPath(project, byId(2), scan)).toBe(
      join(dir, "docs", "010.stuff", "002.feat.inside.md"),
    )
    // child of doc 2 → colocated with doc 2, in the group dir
    expect(computeExpectedPath(project, byId(3), scan)).toBe(
      join(dir, "docs", "010.stuff", "003.task.child.md"),
    )
  })

  it("keeps the current directory when the parent ref is unresolvable", () => {
    const { project, dir } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/010.stuff/002.feat.stray.md": {
          parent: "99.feat.gone",
          title: "Stray",
          status: "new",
        },
      },
    })
    const scan = scanNodes(project)
    const doc = loadDocInfo(scan.docs[0])
    // parent present but resolving to nothing → tidy's problem, not
    // placement's: the doc stays where it is
    expect(computeExpectedPath(project, doc, scan)).toBe(
      join(dir, "docs", "010.stuff", "002.feat.stray.md"),
    )
  })

  it("keeps the current slug when the title is blank or slugifies to nothing", () => {
    const { project, dir } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/001.feat.keeper.md": { title: "  ", status: "new" },
        "docs/002.feat.survivor.md": { title: "!!!", status: "new" },
      },
    })
    const scan = scanNodes(project)
    const byId = (id: number) =>
      loadDocInfo(scan.docs.find((d) => d.id === id)!)
    expect(computeExpectedPath(project, byId(1), scan)).toBe(
      join(dir, "docs", "001.feat.keeper.md"),
    )
    expect(computeExpectedPath(project, byId(2), scan)).toBe(
      join(dir, "docs", "002.feat.survivor.md"),
    )
  })
})
