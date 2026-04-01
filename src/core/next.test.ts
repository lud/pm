import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createTestProject, type TestSetup } from "../lib/test-setup.js"
import {
  findNextDocument,
  type TraversalEvent,
  TraversalEventTypes,
} from "./next.js"

let onEvent: (event: TraversalEvent) => void
let expectEvent: (match: Partial<TraversalEvent>) => void

beforeEach(() => {
  const events: TraversalEvent[] = []
  let callIndex = 0

  onEvent = (e) => {
    events.push(e)
  }

  expectEvent = (match) => {
    expect(events[callIndex]).toMatchObject(match)
    callIndex++
  }

  afterEach(() => {
    expect(callIndex).toBe(events.length)
  })
})

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
      children: {
        "context/features/001.feat.alpha/002.spec.design.md": {
          title: "Design",
          status: "specified",
          children: {
            "context/features/001.feat.alpha/003.task.first.md": {
              title: "First",
              status: "done",
            },
            "context/features/001.feat.alpha/004.task.second.md": {
              title: "Second",
              status: "new",
            },
            "context/features/001.feat.alpha/005.task.third.md": {
              title: "Third",
              status: "new",
            },
          },
        },
        "context/features/001.feat.alpha/006.spec.api.md": {
          title: "API",
          status: "new",
          children: {
            "context/features/001.feat.alpha/007.task.endpoint.md": {
              title: "Endpoint",
              status: "new",
            },
          },
        },
      },
    },
    "context/features/008.feat.beta/008.feat.beta.md": {
      title: "Beta",
      status: "new",
      children: {
        "context/features/008.feat.beta/009.spec.beta-design.md": {
          title: "Beta design",
          status: "new",
        },
      },
    },
  },
}

describe("findNextDocument", () => {
  it("scenario A: picks next sibling task", () => {
    const { project } = testProject.setup(SCENARIO_FULL)
    const result = findNextDocument(project, 4, { onEvent })
    expect(result).not.toBeNull()
    expect(result!.id).toBe(5)
    expectEvent({ type: TraversalEventTypes.Start, documentId: 4 })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 4 })
    expectEvent({
      type: TraversalEventTypes.VisitSiblings,
      documentId: 4,
      siblingsIds: [3, 5],
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 3 })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 5 })
    expectEvent({ type: TraversalEventTypes.Found, documentId: 5 })
  })

  it("scenario B: picks earlier sibling when current is last", () => {
    const { project } = testProject.setup(SCENARIO_FULL)
    const result = findNextDocument(project, 5, { onEvent })
    expect(result).not.toBeNull()
    expect(result!.id).toBe(4)
    expectEvent({ type: TraversalEventTypes.Start, documentId: 5 })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 5 })
    expectEvent({
      type: TraversalEventTypes.VisitSiblings,
      documentId: 5,
      siblingsIds: [3, 4],
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 3 })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 4 })
    expectEvent({ type: TraversalEventTypes.Found, documentId: 4 })
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
    const result = findNextDocument(project, 4, { onEvent })
    expect(result).not.toBeNull()
    // Goes up to spec 2 → sibling spec 6 → child task 7
    expect(result!.id).toBe(7)
    expectEvent({ type: TraversalEventTypes.Start, documentId: 4 })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 4 })
    expectEvent({
      type: TraversalEventTypes.VisitSiblings,
      documentId: 4,
      siblingsIds: [3, 5],
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 3 })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 5 })
    expectEvent({
      type: TraversalEventTypes.GoToParent,
      documentId: 5,
      parentId: 2,
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 2 })
    expectEvent({
      type: TraversalEventTypes.VisitSiblings,
      documentId: 2,
      siblingsIds: [6],
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 6 })
    expectEvent({
      type: TraversalEventTypes.VisitChildren,
      documentId: 6,
      childrenIds: [7],
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 7 })
    expectEvent({ type: TraversalEventTypes.Found, documentId: 7 })
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
    const result = findNextDocument(project, 4, { onEvent })
    expect(result).not.toBeNull()
    // Goes up through specs, across to feat 8, down to spec 9 (leaf)
    expect(result!.id).toBe(9)
    expectEvent({ type: TraversalEventTypes.Start, documentId: 4 })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 4 })
    expectEvent({
      type: TraversalEventTypes.VisitSiblings,
      documentId: 4,
      siblingsIds: [3, 5],
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 3 })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 5 })
    expectEvent({
      type: TraversalEventTypes.GoToParent,
      documentId: 5,
      parentId: 2,
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 2 })
    expectEvent({
      type: TraversalEventTypes.VisitSiblings,
      documentId: 2,
      siblingsIds: [6],
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 6 })
    expectEvent({
      type: TraversalEventTypes.VisitChildren,
      documentId: 6,
      childrenIds: [7],
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 7 })
    expectEvent({
      type: TraversalEventTypes.GoToParent,
      documentId: 7,
      parentId: 6,
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 6 })
    expectEvent({
      type: TraversalEventTypes.GoToParent,
      documentId: 6,
      parentId: 1,
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 1 })
    expectEvent({
      type: TraversalEventTypes.VisitSiblings,
      documentId: 1,
      siblingsIds: [8],
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 8 })
    expectEvent({
      type: TraversalEventTypes.VisitChildren,
      documentId: 8,
      childrenIds: [9],
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 9 })
    expectEvent({ type: TraversalEventTypes.Found, documentId: 9 })
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
    const result = findNextDocument(project, 4, { onEvent })
    expect(result).not.toBeNull()
    expect(result!.id).toBe(9)
    expectEvent({ type: TraversalEventTypes.Start, documentId: 4 })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 4 })
    expectEvent({
      type: TraversalEventTypes.VisitSiblings,
      documentId: 4,
      siblingsIds: [3, 5],
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 3 })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 5 })
    expectEvent({
      type: TraversalEventTypes.GoToParent,
      documentId: 5,
      parentId: 2,
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 2 })
    expectEvent({
      type: TraversalEventTypes.VisitSiblings,
      documentId: 2,
      siblingsIds: [6],
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 6 })
    expectEvent({
      type: TraversalEventTypes.VisitChildren,
      documentId: 6,
      childrenIds: [7],
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 7 })
    expectEvent({
      type: TraversalEventTypes.GoToParent,
      documentId: 7,
      parentId: 6,
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 6 })
    expectEvent({
      type: TraversalEventTypes.GoToParent,
      documentId: 6,
      parentId: 1,
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 1 })
    expectEvent({
      type: TraversalEventTypes.VisitSiblings,
      documentId: 1,
      siblingsIds: [8],
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 8 })
    expectEvent({
      type: TraversalEventTypes.VisitChildren,
      documentId: 8,
      childrenIds: [9],
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 9 })
    expectEvent({ type: TraversalEventTypes.Found, documentId: 9 })
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
    const result = findNextDocument(project, 4, { onEvent })
    expect(result).toBeNull()
    expectEvent({ type: TraversalEventTypes.Start, documentId: 4 })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 4 })
    expectEvent({
      type: TraversalEventTypes.VisitSiblings,
      documentId: 4,
      siblingsIds: [3, 5],
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 3 })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 5 })
    expectEvent({
      type: TraversalEventTypes.GoToParent,
      documentId: 5,
      parentId: 2,
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 2 })
    expectEvent({
      type: TraversalEventTypes.VisitSiblings,
      documentId: 2,
      siblingsIds: [6],
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 6 })
    expectEvent({
      type: TraversalEventTypes.VisitChildren,
      documentId: 6,
      childrenIds: [7],
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 7 })
    expectEvent({
      type: TraversalEventTypes.GoToParent,
      documentId: 7,
      parentId: 6,
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 6 })
    expectEvent({
      type: TraversalEventTypes.GoToParent,
      documentId: 6,
      parentId: 1,
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 1 })
    expectEvent({
      type: TraversalEventTypes.VisitSiblings,
      documentId: 1,
      siblingsIds: [8],
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 8 })
    expectEvent({
      type: TraversalEventTypes.VisitChildren,
      documentId: 8,
      childrenIds: [9],
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 9 })
    expectEvent({
      type: TraversalEventTypes.GoToParent,
      documentId: 9,
      parentId: 8,
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 8 })
    expectEvent({ type: TraversalEventTypes.Exhausted })
  })

  it("returns null when current document not found", () => {
    const { project } = testProject.setup(SCENARIO_FULL)
    const result = findNextDocument(project, 999, { onEvent })
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
    const result = findNextDocument(project, 4, { onEvent })
    expect(result).not.toBeNull()
    expect(result!.id).toBe(7)
    expectEvent({ type: TraversalEventTypes.Start, documentId: 4 })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 4 })
    expectEvent({
      type: TraversalEventTypes.VisitSiblings,
      documentId: 4,
      siblingsIds: [3, 5],
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 3 })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 5 })
    expectEvent({
      type: TraversalEventTypes.GoToParent,
      documentId: 5,
      parentId: 2,
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 2 })
    expectEvent({
      type: TraversalEventTypes.VisitSiblings,
      documentId: 2,
      siblingsIds: [6],
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 6 })
    expectEvent({
      type: TraversalEventTypes.VisitChildren,
      documentId: 6,
      childrenIds: [7],
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 7 })
    expectEvent({ type: TraversalEventTypes.Found, documentId: 7 })
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
    const result = findNextDocument(project, 2, { onEvent })
    expect(result).not.toBeNull()
    expect(result!.id).toBe(3)
    expectEvent({ type: TraversalEventTypes.Start, documentId: 2 })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 2 })
    expectEvent({
      type: TraversalEventTypes.VisitSiblings,
      documentId: 2,
      siblingsIds: [3],
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 3 })
    expectEvent({ type: TraversalEventTypes.Found, documentId: 3 })
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
    const result = findNextDocument(project, 1, { onEvent })
    expect(result).not.toBeNull()
    expect(result!.id).toBe(2)
    expectEvent({ type: TraversalEventTypes.Start, documentId: 1 })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 1 })
    expectEvent({
      type: TraversalEventTypes.VisitSiblings,
      documentId: 1,
      siblingsIds: [2],
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 2 })
    expectEvent({ type: TraversalEventTypes.Found, documentId: 2 })
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
    const result = findNextDocument(project, 1, { onEvent })
    expect(result).toBeNull()
    expectEvent({ type: TraversalEventTypes.Start, documentId: 1 })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 1 })
    expectEvent({ type: TraversalEventTypes.Exhausted })
  })

  it("skips doctypes with workflows disabled", () => {
    const { project } = testProject.setup({
      pmJson: {
        doctypes: {
          ...DOCTYPES,
          context: {
            tag: "ctx",
            dir: "context/features",
            intermediateDir: true,
            workflows: false,
          },
        },
      },
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
          status: "new",
        },
        "context/features/010.ctx.notes.md": {
          title: "Notes",
          status: "new",
        },
      },
    })
    // Current=3 (task), no sibling tasks → up to spec 2, no sibling specs
    // → up to feat 1, context 10 exists but workflows=false so invisible
    // → exhausted
    const result = findNextDocument(project, 3, { onEvent })
    expect(result).toBeNull()
    expectEvent({ type: TraversalEventTypes.Start, documentId: 3 })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 3 })
    expectEvent({
      type: TraversalEventTypes.GoToParent,
      documentId: 3,
      parentId: 2,
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 2 })
    expectEvent({
      type: TraversalEventTypes.GoToParent,
      documentId: 2,
      parentId: 1,
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 1 })
    expectEvent({ type: TraversalEventTypes.Exhausted })
  })

  it("traverses from current document even when its doctype has workflows disabled", () => {
    const { project } = testProject.setup({
      pmJson: {
        doctypes: {
          feature: {
            tag: "feat",
            dir: "context/features",
            intermediateDir: true,
          },
          context: {
            tag: "ctx",
            dir: "context/meta",
            intermediateDir: true,
            workflows: false,
          },
        },
      },
      files: {
        "context/features/001.feat.alpha/001.feat.alpha.md": {
          title: "Alpha",
          status: "new",
        },
        "context/meta/002.ctx.notes.md": {
          title: "Notes",
          status: "new",
        },
      },
    })
    // Current is a workflows-disabled doc but still used as starting point
    const result = findNextDocument(project, 2, { onEvent })
    expect(result).not.toBeNull()
    expect(result!.id).toBe(1)
    expectEvent({ type: TraversalEventTypes.Start, documentId: 2 })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 2 })
    expectEvent({
      type: TraversalEventTypes.VisitSiblings,
      documentId: 2,
      siblingsIds: [1],
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 1 })
    expectEvent({ type: TraversalEventTypes.Found, documentId: 1 })
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
    const result = findNextDocument(project, 4, { onEvent })
    expect(result).toBeNull()
    expectEvent({ type: TraversalEventTypes.Start, documentId: 4 })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 4 })
    expectEvent({
      type: TraversalEventTypes.VisitSiblings,
      documentId: 4,
      siblingsIds: [3],
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 3 })
    expectEvent({
      type: TraversalEventTypes.GoToParent,
      documentId: 3,
      parentId: 2,
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 2 })
    expectEvent({
      type: TraversalEventTypes.GoToParent,
      documentId: 2,
      parentId: 1,
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 1 })
    expectEvent({ type: TraversalEventTypes.Exhausted })
  })

  // ---------------------------------------------------------------------------
  // Children-of-current: when current is not a leaf, search its children first
  // ---------------------------------------------------------------------------

  it("searches children of current first when current is not a leaf", () => {
    // Current=2 (spec, not a leaf), has child tasks 3 (done) and 4 (new)
    // Should pick task 4 as the next document (child of current)
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
          status: "in-progress",
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
      },
    })
    const result = findNextDocument(project, 2, { onEvent })
    expect(result).not.toBeNull()
    expect(result!.id).toBe(4)
    expectEvent({ type: TraversalEventTypes.Start, documentId: 2 })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 2 })
    expectEvent({
      type: TraversalEventTypes.VisitChildren,
      documentId: 2,
      childrenIds: [3, 4, 5],
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 3 })
    expectEvent({
      type: TraversalEventTypes.VisitSiblings,
      documentId: 3,
      siblingsIds: [4, 5],
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 4 })
    expectEvent({ type: TraversalEventTypes.Found, documentId: 4 })
  })

  it("falls back to siblings when current is not a leaf but all children are done", () => {
    // Current=2 (spec), children 3 and 4 are both done
    // Should fall back to sibling spec 5
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
          status: "in-progress",
        },
        "context/features/001.feat.alpha/003.task.first.md": {
          parent: 2,
          title: "First",
          status: "done",
        },
        "context/features/001.feat.alpha/004.task.second.md": {
          parent: 2,
          title: "Second",
          status: "done",
        },
        "context/features/001.feat.alpha/005.spec.api.md": {
          parent: 1,
          title: "API",
          status: "new",
        },
      },
    })
    const result = findNextDocument(project, 2, { onEvent })
    expect(result).not.toBeNull()
    expect(result!.id).toBe(5)
    expectEvent({ type: TraversalEventTypes.Start, documentId: 2 })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 2 })
    expectEvent({
      type: TraversalEventTypes.VisitChildren,
      documentId: 2,
      childrenIds: [3, 4],
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 3 })
    expectEvent({
      type: TraversalEventTypes.VisitSiblings,
      documentId: 3,
      siblingsIds: [4],
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 4 })
    expectEvent({
      type: TraversalEventTypes.GoToParent,
      documentId: 4,
      parentId: 2,
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 2 })
    expectEvent({
      type: TraversalEventTypes.VisitSiblings,
      documentId: 2,
      siblingsIds: [5],
    })
    expectEvent({ type: TraversalEventTypes.Inspect, documentId: 5 })
    expectEvent({ type: TraversalEventTypes.Found, documentId: 5 })
  })
})
