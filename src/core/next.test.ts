import { describe, expect, it } from "vitest"
import { createTestProject, type TestSetup } from "../lib/test-setup.js"
import { findNextDocument } from "./next.js"

const testProject = createTestProject("next")

const DOCTYPES = {
  feature: { tag: "feat", dir: "context/features", intermediateDir: true },
  spec: { tag: "spec", dir: ".", parent: "feature" },
  task: { tag: "task", dir: ".", parent: "spec" },
}

// ---------------------------------------------------------------------------
// Scenario A: sibling available
// feat 1 (new)
//   spec 2 (specified) parent:1
//     task 3 (done) parent:2
//     task 4 (new) parent:2      ← current
//     task 5 (new) parent:2
//   spec 6 (new) parent:1
//     task 7 (new) parent:6
// feat 8 (new)
//   spec 9 (new) parent:8
// ---------------------------------------------------------------------------

const SCENARIO_FULL: TestSetup = {
  pmJson: { doctypes: DOCTYPES },
  files: {
    "context/features/001.feat.alpha/001.feat.alpha.md": {
      title: "Alpha",
      status: "new",
    },
    "context/features/001.feat.alpha/002.spec.design.md": {
      parent: 1,
      title: "Design",
      status: "specified",
    },
    "context/features/001.feat.alpha/003.task.first.md": {
      parent: 2,
      title: "First",
      status: "done",
    },
    "context/features/001.feat.alpha/004.task.second.md": {
      parent: 2,
      title: "Second",
      status: "new",
    },
    "context/features/001.feat.alpha/005.task.third.md": {
      parent: 2,
      title: "Third",
      status: "new",
    },
    "context/features/001.feat.alpha/006.spec.api.md": {
      parent: 1,
      title: "API",
      status: "new",
    },
    "context/features/001.feat.alpha/007.task.endpoint.md": {
      parent: 6,
      title: "Endpoint",
      status: "new",
    },
    "context/features/008.feat.beta/008.feat.beta.md": {
      title: "Beta",
      status: "new",
    },
    "context/features/008.feat.beta/009.spec.beta-design.md": {
      parent: 8,
      title: "Beta design",
      status: "new",
    },
  },
}

describe("findNextDocument", () => {
  it("scenario A: picks next sibling task", () => {
    const { project } = testProject.setup(SCENARIO_FULL)
    const result = findNextDocument(project, 4)
    expect(result).not.toBeNull()
    expect(result!.id).toBe(5)
  })

  it("scenario B: picks earlier sibling when current is last", () => {
    const { project } = testProject.setup(SCENARIO_FULL)
    const result = findNextDocument(project, 5)
    expect(result).not.toBeNull()
    expect(result!.id).toBe(4)
  })

  it("scenario C: goes to parent sibling when no task sibling available", () => {
    // Make task 5 done so 4 has no available siblings
    const { project } = testProject.setup({
      pmJson: { doctypes: DOCTYPES },
      files: {
        ...SCENARIO_FULL.files,
        "context/features/001.feat.alpha/005.task.third.md": {
          parent: 2,
          title: "Third",
          status: "done",
        },
      },
    })
    const result = findNextDocument(project, 4)
    expect(result).not.toBeNull()
    // Goes up to spec 2 → sibling spec 6 → child task 7
    expect(result!.id).toBe(7)
  })

  it("scenario D: traverses across features to find leaf spec", () => {
    // Tasks 5 and 7 done, so spec 6 has no available children
    const { project } = testProject.setup({
      pmJson: { doctypes: DOCTYPES },
      files: {
        ...SCENARIO_FULL.files,
        "context/features/001.feat.alpha/005.task.third.md": {
          parent: 2,
          title: "Third",
          status: "done",
        },
        "context/features/001.feat.alpha/007.task.endpoint.md": {
          parent: 6,
          title: "Endpoint",
          status: "done",
        },
      },
    })
    const result = findNextDocument(project, 4, {})
    expect(result).not.toBeNull()
    // Goes up through specs, across to feat 8, down to spec 9 (leaf)
    expect(result!.id).toBe(9)
  })

  it("scenario E: traverses from deep task to distant leaf", () => {
    // Everything in feat 1 tree is done except task 4 (current)
    const { project } = testProject.setup({
      pmJson: { doctypes: DOCTYPES },
      files: {
        ...SCENARIO_FULL.files,
        "context/features/001.feat.alpha/005.task.third.md": {
          parent: 2,
          title: "Third",
          status: "done",
        },
        "context/features/001.feat.alpha/006.spec.api.md": {
          parent: 1,
          title: "API",
          status: "done",
        },
        "context/features/001.feat.alpha/007.task.endpoint.md": {
          parent: 6,
          title: "Endpoint",
          status: "done",
        },
      },
    })
    const result = findNextDocument(project, 4)
    expect(result).not.toBeNull()
    expect(result!.id).toBe(9)
  })

  it("scenario F: returns null when all documents unavailable", () => {
    const { project } = testProject.setup({
      pmJson: { doctypes: DOCTYPES },
      files: {
        ...SCENARIO_FULL.files,
        "context/features/001.feat.alpha/004.task.second.md": {
          parent: 2,
          title: "Second",
          status: "new",
        },
        "context/features/001.feat.alpha/005.task.third.md": {
          parent: 2,
          title: "Third",
          status: "done",
        },
        "context/features/001.feat.alpha/006.spec.api.md": {
          parent: 1,
          title: "API",
          status: "done",
        },
        "context/features/001.feat.alpha/007.task.endpoint.md": {
          parent: 6,
          title: "Endpoint",
          status: "done",
        },
        "context/features/008.feat.beta/008.feat.beta.md": {
          title: "Beta",
          status: "done",
        },
        "context/features/008.feat.beta/009.spec.beta-design.md": {
          parent: 8,
          title: "Beta design",
          status: "done",
        },
      },
    })
    const result = findNextDocument(project, 4)
    expect(result).toBeNull()
  })

  it("returns null when current document not found", () => {
    const { project } = testProject.setup(SCENARIO_FULL)
    const result = findNextDocument(project, 999)
    expect(result).toBeNull()
  })

  it("skips blocked documents", () => {
    const { project } = testProject.setup({
      pmJson: { doctypes: DOCTYPES },
      files: {
        ...SCENARIO_FULL.files,
        "context/features/001.feat.alpha/005.task.third.md": {
          parent: 2,
          title: "Third",
          status: "blocked",
        },
      },
    })
    // Current=4, sibling 5 is blocked, sibling 3 is done → no task sibling
    // Goes up to spec 2 → sibling spec 6 → child task 7
    const result = findNextDocument(project, 4)
    expect(result).not.toBeNull()
    expect(result!.id).toBe(7)
  })

  it("selects leaf spec when it has no children", () => {
    // Spec 9 has no tasks — it's a leaf, should be selectable
    const { project } = testProject.setup({
      pmJson: { doctypes: DOCTYPES },
      files: {
        "context/features/001.feat.alpha/001.feat.alpha.md": {
          title: "Alpha",
          status: "new",
        },
        "context/features/001.feat.alpha/002.spec.one.md": {
          parent: 1,
          title: "One",
          status: "new",
        },
        "context/features/001.feat.alpha/003.spec.two.md": {
          parent: 1,
          title: "Two",
          status: "new",
        },
      },
    })
    const result = findNextDocument(project, 2)
    expect(result).not.toBeNull()
    expect(result!.id).toBe(3)
  })

  it("handles single root feature with no children", () => {
    const { project } = testProject.setup({
      pmJson: { doctypes: DOCTYPES },
      files: {
        "context/features/001.feat.only/001.feat.only.md": {
          title: "Only",
          status: "new",
        },
        "context/features/002.feat.other/002.feat.other.md": {
          title: "Other",
          status: "new",
        },
      },
    })
    const result = findNextDocument(project, 1)
    expect(result).not.toBeNull()
    expect(result!.id).toBe(2)
  })

  it("returns null for single document project", () => {
    const { project } = testProject.setup({
      pmJson: { doctypes: DOCTYPES },
      files: {
        "context/features/001.feat.only/001.feat.only.md": {
          title: "Only",
          status: "new",
        },
      },
    })
    const result = findNextDocument(project, 1)
    expect(result).toBeNull()
  })

  it("does not return the current document even if active", () => {
    // Only two tasks, current=4, sibling=3 is done. No other docs.
    const { project } = testProject.setup({
      pmJson: { doctypes: DOCTYPES },
      files: {
        "context/features/001.feat.alpha/001.feat.alpha.md": {
          title: "Alpha",
          status: "new",
        },
        "context/features/001.feat.alpha/002.spec.design.md": {
          parent: 1,
          title: "Design",
          status: "new",
        },
        "context/features/001.feat.alpha/003.task.first.md": {
          parent: 2,
          title: "First",
          status: "done",
        },
        "context/features/001.feat.alpha/004.task.second.md": {
          parent: 2,
          title: "Second",
          status: "new",
        },
      },
    })
    // No available sibling, go up to spec 2 (has children but none available besides visited)
    // spec 2 has no sibling, go up to feat 1 (no sibling) → exhausted
    const result = findNextDocument(project, 4)
    expect(result).toBeNull()
  })
})
