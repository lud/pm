import { describe, expect, it } from "vitest"
import { createTestProject } from "../lib/test-setup.js"
import { buildReadyTree } from "./ready.js"

const testProject = createTestProject("ready")

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

function ids(result: { entries: { node: { id: number } }[] }) {
  return result.entries.map((e) => e.node.id)
}

describe("buildReadyTree", () => {
  it("lists active root docs at depth 0, sorted by ID, done docs gone", () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/003.task.b.md": { title: "B", status: "new" },
        "docs/001.feat.a.md": { title: "A", status: "in-progress" },
        "docs/002.adr.old.md": { title: "Old", status: "accepted" },
      },
    })
    const result = buildReadyTree(project, null)
    expect(ids(result)).toEqual([1, 3])
    expect(result.entries.every((e) => e.depth === 0)).toBe(true)
    expect(result.warnings).toEqual([])
  })

  it("shows groups only on the path to actionable docs, without status", () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/010.active-group/011.task.go.md": {
          parent: "10.active-group",
          title: "Go",
          status: "new",
        },
        "docs/020.done-group/021.task.finished.md": {
          parent: "20.done-group",
          title: "Finished",
          status: "done",
        },
      },
    })
    const result = buildReadyTree(project, null)
    expect(ids(result)).toEqual([10, 11])
    const group = result.entries[0]
    expect(group.node.kind).toBe("group")
    expect(group.type).toBeNull()
    expect(group.status).toBeUndefined()
    expect(group.title).toBe("active-group")
    expect(result.entries[1].depth).toBe(1)
  })

  it("keeps a done parent as context above an actionable child", () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/001.feat.done-parent.md": {
          title: "Done parent",
          status: "done",
        },
        "docs/002.task.child.md": {
          parent: "1.feat.done-parent",
          title: "Child",
          status: "new",
        },
      },
    })
    const result = buildReadyTree(project, null)
    expect(ids(result)).toEqual([1, 2])
    expect(result.entries[0].status).toBe("done")
    expect(result.entries[1].depth).toBe(1)
  })

  it("excludes blocked docs by default, includes them with withBlocked", () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/001.task.free.md": { title: "Free", status: "new" },
        "docs/002.task.stuck.md": { title: "Stuck", status: "blocked" },
      },
    })
    expect(ids(buildReadyTree(project, null))).toEqual([1])
    expect(ids(buildReadyTree(project, null, { withBlocked: true }))).toEqual([
      1, 2,
    ])
  })

  describe("depends gate", () => {
    it("excludes docs whose dependencies are not done, in any ref form", () => {
      const { project } = testProject.setup({
        pmJson: PM_JSON,
        files: {
          "docs/001.task.dep.md": { title: "Dep", status: "in-progress" },
          "docs/002.task.waiting.md": {
            title: "Waiting",
            status: "new",
            depends: [1],
          },
          "docs/003.task.also-waiting.md": {
            title: "Also",
            status: "new",
            depends: ["001.task.dep"],
          },
          "docs/004.task.free.md": { title: "Free", status: "new" },
        },
      })
      const result = buildReadyTree(project, null)
      expect(ids(result)).toEqual([1, 4])
      expect(result.warnings).toEqual([])
    })

    it("frees the dependent once every dependency is done", () => {
      const { project } = testProject.setup({
        pmJson: PM_JSON,
        files: {
          "docs/001.task.dep.md": { title: "Dep", status: "done" },
          "docs/002.adr.choice.md": { title: "Choice", status: "accepted" },
          "docs/003.task.ready.md": {
            title: "Ready",
            status: "new",
            depends: [1, "2.adr.choice"],
          },
        },
      })
      expect(ids(buildReadyTree(project, null))).toEqual([3])
    })

    it("withBlocked also reveals dependency-waiting docs", () => {
      const { project } = testProject.setup({
        pmJson: PM_JSON,
        files: {
          "docs/001.task.dep.md": { title: "Dep", status: "new" },
          "docs/002.task.waiting.md": {
            title: "Waiting",
            status: "new",
            depends: [1],
          },
        },
      })
      expect(ids(buildReadyTree(project, null))).toEqual([1])
      expect(ids(buildReadyTree(project, null, { withBlocked: true }))).toEqual(
        [1, 2],
      )
    })

    it("warns on group, missing, and malformed entries without gating", () => {
      const { project } = testProject.setup({
        pmJson: PM_JSON,
        dirs: ["docs/010.stuff"],
        files: {
          "docs/001.task.a.md": {
            title: "A",
            status: "new",
            depends: ["10.stuff", 99, "garbage"],
          },
        },
      })
      const result = buildReadyTree(project, null)
      expect(ids(result)).toEqual([1])
      expect(result.warnings).toHaveLength(3)
      const combined = result.warnings.join("\n")
      expect(combined).toMatch(/group/i)
      expect(combined).toMatch(/99/)
      expect(combined).toMatch(/garbage/)
    })
  })

  it("marks the current node, docs and groups alike", () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/010.stuff/011.task.a.md": {
          parent: "10.stuff",
          title: "A",
          status: "new",
        },
      },
    })
    const onDoc = buildReadyTree(project, 11)
    expect(onDoc.entries.map((e) => [e.node.id, e.isCurrent])).toEqual([
      [10, false],
      [11, true],
    ])
    const onGroup = buildReadyTree(project, 10)
    expect(onGroup.entries.map((e) => [e.node.id, e.isCurrent])).toEqual([
      [10, true],
      [11, false],
    ])
  })

  it("uses slug fallbacks and raw tags for undeclared types", () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/001.wild.mystery.md": { status: "new" },
      },
    })
    const [entry] = buildReadyTree(project, null).entries
    expect(entry.type).toBe("wild")
    expect(entry.title).toBe("mystery")
  })

  it("treats docs with unresolvable parents as roots", () => {
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
    const result = buildReadyTree(project, null)
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].depth).toBe(0)
  })
})
