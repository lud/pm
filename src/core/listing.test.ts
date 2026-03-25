import { describe, expect, it } from "vitest"
import { createTestProject, type TestSetup } from "../lib/test-setup.js"
import { getStatusSummary, listDocuments } from "./listing.js"

const testProject = createTestProject("listing")

const BASIC_SETUP: TestSetup = {
  pmJson: {
    doctypes: {
      feature: { tag: "feat", dir: "context/features", intermediateDir: true },
      spec: { tag: "spec", dir: ".", parent: "feature" },
      task: { tag: "task", dir: ".", parent: "spec" },
    },
  },
  files: {
    "context/features/001.feat.user-auth/001.feat.user-auth.md": {
      title: "User authentication",
      status: "new",
      created_on: "2026-03-20",
    },
    "context/features/001.feat.user-auth/002.spec.login-flow.md": {
      parent: "1.feat.user-auth",
      title: "Login flow",
      status: "new",
      created_on: "2026-03-20",
    },
    "context/features/001.feat.user-auth/003.task.jwt-middleware.md": {
      parent: "2.spec.login-flow",
      title: "Add JWT middleware",
      status: "done",
      created_on: "2026-03-21",
    },
    "context/features/001.feat.user-auth/004.task.session-store.md": {
      parent: "2.spec.login-flow",
      title: "Session store",
      status: "new",
      created_on: "2026-03-21",
    },
  },
}

const MULTI_STATUS_SETUP: TestSetup = {
  pmJson: {
    doctypes: {
      feature: { tag: "feat", dir: "context/features", intermediateDir: true },
      spec: { tag: "spec", dir: ".", parent: "feature" },
      task: { tag: "task", dir: ".", parent: "spec" },
    },
  },
  files: {
    "context/features/001.feat.auth/001.feat.auth.md": {
      title: "Authentication",
      status: "in-progress",
    },
    "context/features/001.feat.auth/002.spec.login.md": {
      parent: "1.feat.auth",
      title: "Login flow",
      status: "specified",
    },
    "context/features/001.feat.auth/003.spec.signup.md": {
      parent: "1.feat.auth",
      title: "Signup flow",
      status: "new",
    },
    "context/features/001.feat.auth/004.task.jwt.md": {
      parent: "2.spec.login",
      title: "JWT middleware",
      status: "done",
    },
    "context/features/001.feat.auth/006.task.session.md": {
      parent: "2.spec.login",
      title: "Session store",
      status: "in-progress",
    },
    "context/features/001.feat.auth/007.task.hash.md": {
      parent: "3.spec.signup",
      title: "Password hashing",
      status: "new",
    },
    "context/features/001.feat.auth/008.task.validate.md": {
      parent: "3.spec.signup",
      title: "Input validation",
      status: "done",
    },
    "context/features/005.feat.payments/005.feat.payments.md": {
      title: "Payments",
      status: "new",
    },
  },
}

// ---------------------------------------------------------------------------
// listDocuments
// ---------------------------------------------------------------------------

describe("listDocuments", () => {
  it("lists all active documents by default", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    const entries = listDocuments(project)
    // Doc 3 is done, so should be excluded
    const ids = entries.map((e) => e.document.id).sort((a, b) => a - b)
    expect(ids).toEqual([1, 2, 4])
  })

  it("lists done documents with --done", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    const entries = listDocuments(project, { done: true })
    const ids = entries.map((e) => e.document.id)
    expect(ids).toEqual([3])
  })

  it("lists all documents with --all-statuses", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    const entries = listDocuments(project, { allStatuses: true })
    expect(entries).toHaveLength(4)
  })

  it("filters by doctype", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    const entries = listDocuments(project, {
      doctype: "task",
      allStatuses: true,
    })
    const ids = entries.map((e) => e.document.id).sort((a, b) => a - b)
    expect(ids).toEqual([3, 4])
  })

  it("filters by exact status", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    const entries = listDocuments(project, {
      status: "done",
      allStatuses: true,
    })
    expect(entries).toHaveLength(1)
    expect(entries[0].document.id).toBe(3)
  })

  it("filters by direct parent", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    // Direct children of feature 1: spec 2
    const entries = listDocuments(project, {
      parentId: 1,
      allStatuses: true,
    })
    const ids = entries.map((e) => e.document.id).sort((a, b) => a - b)
    expect(ids).toEqual([2])
  })

  it("filters direct children of spec", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    // Direct children of spec 2: task 3, task 4
    const entries = listDocuments(project, {
      parentId: 2,
      allStatuses: true,
    })
    const ids = entries.map((e) => e.document.id).sort((a, b) => a - b)
    expect(ids).toEqual([3, 4])
  })

  it("returns empty for parent with no descendants", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    const entries = listDocuments(project, {
      parentId: 3,
      allStatuses: true,
    })
    expect(entries).toHaveLength(0)
  })

  it("includes title from frontmatter", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    const entries = listDocuments(project, { allStatuses: true })
    const feat = entries.find((e) => e.document.id === 1)
    expect(feat!.title).toBe("User authentication")
  })

  it("filters by typed property values", () => {
    const { project } = testProject.setup({
      pmJson: BASIC_SETUP.pmJson,
      files: {
        ...BASIC_SETUP.files,
        // Override doc 4 with extra properties
        "context/features/001.feat.user-auth/004.task.session-store.md": {
          parent: "2.spec.login-flow",
          title: "Session store",
          status: "new",
          created_on: "2026-03-21",
          priority: 2,
          blocked: false,
        },
      },
    })

    const entries = listDocuments(project, {
      propertyFilters: [
        { key: "priority", value: 2 },
        { key: "blocked", value: false },
      ],
      allStatuses: true,
    })

    const ids = entries.map((e) => e.document.id)
    expect(ids).toEqual([4])
  })

  it("requires all propertyFilters to match", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    const entries = listDocuments(project, {
      propertyFilters: [
        { key: "status", value: "new" },
        { key: "status", value: "done" },
      ],
      allStatuses: true,
    })
    expect(entries).toHaveLength(0)
  })

  it("sorts results by ID, not by filesystem order", () => {
    const { project } = testProject.setup({
      pmJson: {
        idMask: "0",
        doctypes: { feature: { tag: "feat", dir: "features" } },
      },
      files: {
        // ID 10 comes before ID 2 in lexical filesystem order ("10." < "2.")
        "features/10.feat.ten/10.feat.ten.md": {
          title: "Ten",
          status: "new",
        },
        "features/2.feat.two/2.feat.two.md": {
          title: "Two",
          status: "new",
        },
      },
    })

    const entries = listDocuments(project, { allStatuses: true })
    const ids = entries.map((e) => e.document.id)
    // Should be sorted by numeric ID, not filesystem order
    expect(ids).toEqual([2, 10])
  })
})

// ---------------------------------------------------------------------------
// getStatusSummary
// ---------------------------------------------------------------------------

describe("getStatusSummary", () => {
  it("returns active/done counts per doctype", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    const summary = getStatusSummary(project)

    const byDoctype = Object.fromEntries(summary.map((s) => [s.doctype, s]))
    expect(byDoctype.feature.active).toBe(1)
    expect(byDoctype.feature.done).toBe(0)
    expect(byDoctype.feature.blocked).toBe(0)
    expect(byDoctype.spec.active).toBe(1)
    expect(byDoctype.spec.done).toBe(0)
    expect(byDoctype.spec.blocked).toBe(0)
    expect(byDoctype.task.active).toBe(1)
    expect(byDoctype.task.done).toBe(1)
    expect(byDoctype.task.blocked).toBe(0)
  })

  it("includes per-status counts", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    const summary = getStatusSummary(project)

    const tasks = summary.find((s) => s.doctype === "task")!
    expect(tasks.statuses).toHaveLength(2)

    const newStatus = tasks.statuses.find((s) => s.status === "new")
    expect(newStatus).toEqual({
      status: "new",
      count: 1,
      isDone: false,
      isBlocked: false,
    })

    const doneStatus = tasks.statuses.find((s) => s.status === "done")
    expect(doneStatus).toEqual({
      status: "done",
      count: 1,
      isDone: true,
      isBlocked: false,
    })
  })

  it("sorts non-terminal statuses before terminal statuses", () => {
    const { project } = testProject.setup(MULTI_STATUS_SETUP)
    const summary = getStatusSummary(project)

    const tasks = summary.find((s) => s.doctype === "task")!
    const statusNames = tasks.statuses.map((s) => s.status)
    // non-terminal alphabetically, then terminal alphabetically
    expect(statusNames).toEqual(["in-progress", "new", "done"])
  })

  it("returns multiple statuses per doctype", () => {
    const { project } = testProject.setup(MULTI_STATUS_SETUP)
    const summary = getStatusSummary(project)

    const features = summary.find((s) => s.doctype === "feature")!
    expect(features.active).toBe(2)
    expect(features.done).toBe(0)
    expect(features.statuses).toHaveLength(2)

    const specs = summary.find((s) => s.doctype === "spec")!
    expect(specs.active).toBe(2)
    expect(specs.done).toBe(0)
  })
})
