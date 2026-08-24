import { describe, expect, it } from "vitest"
import { createTestProject } from "../lib/test-setup.js"
import {
  classifyStatus,
  getStatusSummary,
  listDocuments,
  statusConfigFor,
} from "./list.js"

const testProject = createTestProject("list")

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
// statusConfigFor / classifyStatus
// ---------------------------------------------------------------------------

describe("statusConfigFor", () => {
  it("returns the type's config for declared tags, the global one otherwise", () => {
    const { project } = testProject.setup({ pmJson: PM_JSON, dirs: ["docs"] })
    expect(statusConfigFor(project, "adr").doneStatuses).toEqual([
      "accepted",
      "rejected",
    ])
    expect(statusConfigFor(project, "wild").doneStatuses).toEqual(["done"])
  })
})

describe("classifyStatus", () => {
  it("classifies against a status config, undefined counts as active", () => {
    const { project } = testProject.setup({ pmJson: PM_JSON, dirs: ["docs"] })
    const adr = statusConfigFor(project, "adr")
    expect(classifyStatus("accepted", adr)).toBe("done")
    expect(classifyStatus("blocked", adr)).toBe("blocked")
    expect(classifyStatus("draft", adr)).toBe("active")
    expect(classifyStatus(undefined, adr)).toBe("active")
  })
})

// ---------------------------------------------------------------------------
// listDocuments
// ---------------------------------------------------------------------------

function setupCorpus() {
  return testProject.setup({
    pmJson: PM_JSON,
    files: {
      "docs/001.feat.auth.md": { title: "Auth", status: "in-progress" },
      "docs/002.task.login.md": {
        parent: "1.feat.auth",
        title: "Login",
        status: "new",
      },
      "docs/003.task.legacy.md": {
        parent: "1.feat.auth",
        title: "Legacy",
        status: "done",
      },
      "docs/004.adr.storage.md": { title: "Storage", status: "accepted" },
      "docs/005.task.stuck.md": { title: "Stuck", status: "blocked" },
      "docs/006.wild.thing.md": { status: "new" },
      "docs/010.icebox/011.task.later.md": {
        parent: "10.icebox",
        title: "Later",
        status: "new",
      },
    },
  })
}

describe("listDocuments", () => {
  it("defaults to active docs only, sorted by ID, with type names", () => {
    const { project } = setupCorpus()
    const entries = listDocuments(project)
    expect(entries.map((e) => e.document.id)).toEqual([1, 2, 6, 11])
    expect(entries[0].type).toBe("feature")
    expect(entries[0].title).toBe("Auth")
    // undeclared tag: raw tag as type, slug as title fallback
    const wild = entries.find((e) => e.document.id === 6)!
    expect(wild.type).toBe("wild")
    expect(wild.title).toBe("thing")
  })

  it("respects per-type done statuses and the global fallback", () => {
    const { project } = setupCorpus()
    const done = listDocuments(project, { done: true })
    expect(done.map((e) => e.document.id)).toEqual([3, 4])

    const blocked = listDocuments(project, { blocked: true })
    expect(blocked.map((e) => e.document.id)).toEqual([5])

    const all = listDocuments(project, { allStatuses: true })
    expect(all.map((e) => e.document.id)).toEqual([1, 2, 3, 4, 5, 6, 11])
  })

  it("filters by type name or tag", () => {
    const { project } = setupCorpus()
    expect(
      listDocuments(project, { type: "task" }).map((e) => e.document.id),
    ).toEqual([2, 11])
    expect(
      listDocuments(project, { type: "feature" }).map((e) => e.document.id),
    ).toEqual([1])
    expect(
      listDocuments(project, { type: "feat" }).map((e) => e.document.id),
    ).toEqual([1])
    // undeclared tags can be matched literally
    expect(
      listDocuments(project, { type: "wild" }).map((e) => e.document.id),
    ).toEqual([6])
  })

  it("filters direct children of a doc or a group", () => {
    const { project } = setupCorpus()
    expect(
      listDocuments(project, { parentId: 1, allStatuses: true }).map(
        (e) => e.document.id,
      ),
    ).toEqual([2, 3])
    expect(
      listDocuments(project, { parentId: 10 }).map((e) => e.document.id),
    ).toEqual([11])
  })

  it("an exact status filter disables the default active-only category", () => {
    const { project } = setupCorpus()
    expect(
      listDocuments(project, { status: "done" }).map((e) => e.document.id),
    ).toEqual([3])
    expect(
      listDocuments(project, { status: "in-progress" }).map(
        (e) => e.document.id,
      ),
    ).toEqual([1])
  })

  it("applies property filters with exact equality, all must match", () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/001.task.a.md": {
          title: "A",
          status: "new",
          assignee: "lud",
          size: "large",
        },
        "docs/002.task.b.md": { title: "B", status: "new", assignee: "lud" },
      },
    })
    expect(
      listDocuments(project, {
        propertyFilters: [{ key: "assignee", value: "lud" }],
      }).map((e) => e.document.id),
    ).toEqual([1, 2])
    expect(
      listDocuments(project, {
        propertyFilters: [
          { key: "assignee", value: "lud" },
          { key: "size", value: "large" },
        ],
      }).map((e) => e.document.id),
    ).toEqual([1])
  })
})

// ---------------------------------------------------------------------------
// getStatusSummary
// ---------------------------------------------------------------------------

describe("getStatusSummary", () => {
  it("groups by type name in declaration order, undeclared tags last", () => {
    const { project } = setupCorpus()
    const summary = getStatusSummary(project)
    expect(summary.map((s) => s.type)).toEqual([
      "feature",
      "task",
      "decision",
      "wild",
    ])
  })

  it("counts categories per the type's status config", () => {
    const { project } = setupCorpus()
    const summary = getStatusSummary(project)
    const byType = Object.fromEntries(summary.map((s) => [s.type, s]))

    expect(byType.task).toMatchObject({ active: 2, blocked: 1, done: 1 })
    expect(byType.decision).toMatchObject({ active: 0, blocked: 0, done: 1 })
    expect(byType.feature).toMatchObject({ active: 1, blocked: 0, done: 0 })
  })

  it("sorts statuses active/blocked/done, counts missing status as (none)", () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/001.task.a.md": { title: "A", status: "new" },
        "docs/002.task.b.md": { title: "B", status: "done" },
        "docs/003.task.c.md": { title: "C", status: "blocked" },
        "docs/004.task.d.md": { title: "D" },
      },
    })
    const [tasks] = getStatusSummary(project)
    expect(tasks.statuses).toEqual([
      { status: "(none)", count: 1, isDone: false, isBlocked: false },
      { status: "new", count: 1, isDone: false, isBlocked: false },
      { status: "blocked", count: 1, isDone: false, isBlocked: true },
      { status: "done", count: 1, isDone: true, isBlocked: false },
    ])
    expect(tasks.active).toBe(2)
  })

  it("returns an empty list for an empty project", () => {
    const { project } = testProject.setup({ pmJson: PM_JSON, dirs: ["docs"] })
    expect(getStatusSummary(project)).toEqual([])
  })

  it("groups a file tagged with the type name under that type, once", () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/001.feat.proper.md": { title: "Proper", status: "new" },
        "docs/002.feature.slip.md": { title: "Slip", status: "new" },
      },
    })
    const summary = getStatusSummary(project)
    expect(summary.map((s) => s.type)).toEqual(["feature"])
    expect(summary[0].active).toBe(2)
  })
})
