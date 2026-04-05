import { describe, expect, it } from "vitest"
import { createTestProject, type TestSetup } from "../lib/test-setup.js"
import { buildNextTree } from "./next.js"

const testProject = createTestProject("next")

const DOCTYPES = {
  feature: { tag: "feat", dir: "context/features", intermediateDir: true },
  spec: { tag: "spec", dir: ".", parent: "feature" },
  task: { tag: "task", dir: ".", parent: "spec" },
}

// ---------------------------------------------------------------------------
// Scenario: full tree
// feat 1 (new)
//   spec 2 (specified) parent:1
//     task 3 (done) parent:2
//     task 4 (new) parent:2
//     task 5 (new) parent:2
//   spec 6 (new) parent:1
//     task 7 (new) parent:6
// feat 8 (new)
//   spec 9 (new) parent:8
// ---------------------------------------------------------------------------

const FULL_SETUP: TestSetup = {
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

function entryLine(e: {
  document: { tag: string; id: number }
  title: string
  status?: string
  depth: number
  isCurrent: boolean
}): string {
  const indent = "  ".repeat(e.depth)
  const statusStr = e.status ? ` (${e.status})` : ""
  const currentMarker = e.isCurrent ? " [current]" : ""
  return `${indent}${e.document.tag} ${e.document.id} ${e.title}${statusStr}${currentMarker}`
}

function treeText(entries: ReturnType<typeof buildNextTree>): string {
  return entries.map(entryLine).join("\n")
}

describe("buildNextTree", () => {
  it("builds tree with mixed statuses, pruning done leaves", () => {
    const { project } = testProject.setup(FULL_SETUP)
    const tree = buildNextTree(project, 4)

    // task 3 is done — should not appear
    expect(treeText(tree)).toBe(
      [
        "feat 1 Alpha (new)",
        "  spec 2 Design (specified)",
        "    task 4 Second (new) [current]",
        "    task 5 Third (new)",
        "  spec 6 API (new)",
        "    task 7 Endpoint (new)",
        "feat 8 Beta (new)",
        "  spec 9 Beta design (new)",
      ].join("\n"),
    )
  })

  it("shows done intermediary when it has actionable descendants", () => {
    const { project } = testProject.setup({
      pmJson: { doctypes: DOCTYPES },
      files: {
        "context/features/001.feat.alpha/001.feat.alpha.md": {
          title: "Alpha",
          status: "done",
          children: {
            "context/features/001.feat.alpha/002.spec.design.md": {
              title: "Design",
              status: "done",
              children: {
                "context/features/001.feat.alpha/003.task.first.md": {
                  title: "First",
                  status: "done",
                },
                "context/features/001.feat.alpha/004.task.second.md": {
                  title: "Second",
                  status: "new",
                },
              },
            },
          },
        },
      },
    })
    const tree = buildNextTree(project, null)

    // feat 1 and spec 2 are done but appear as intermediaries
    // task 3 is done with no actionable descendants — pruned
    expect(treeText(tree)).toBe(
      [
        "feat 1 Alpha (done)",
        "  spec 2 Design (done)",
        "    task 4 Second (new)",
      ].join("\n"),
    )
  })

  it("works without a current document", () => {
    const { project } = testProject.setup(FULL_SETUP)
    const tree = buildNextTree(project, null)

    // No [current] marker on any entry
    expect(tree.every((e) => !e.isCurrent)).toBe(true)
    expect(tree.length).toBeGreaterThan(0)
  })

  it("returns empty array when all documents are done", () => {
    const { project } = testProject.setup({
      pmJson: { doctypes: DOCTYPES },
      files: {
        "context/features/001.feat.alpha/001.feat.alpha.md": {
          title: "Alpha",
          status: "done",
          children: {
            "context/features/001.feat.alpha/002.spec.design.md": {
              title: "Design",
              status: "done",
            },
          },
        },
      },
    })
    const tree = buildNextTree(project, null)
    expect(tree).toEqual([])
  })

  it("excludes doctypes with workflows disabled", () => {
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
        "context/features/010.ctx.notes.md": {
          title: "Notes",
          status: "new",
        },
      },
    })
    const tree = buildNextTree(project, null)

    const ids = tree.map((e) => e.document.id)
    expect(ids).toContain(1)
    expect(ids).not.toContain(10)
  })

  it("excludes blocked documents by default", () => {
    const { project } = testProject.setup({
      pmJson: { doctypes: DOCTYPES },
      files: {
        "context/features/001.feat.alpha/001.feat.alpha.md": {
          title: "Alpha",
          status: "new",
          children: {
            "context/features/001.feat.alpha/002.spec.design.md": {
              title: "Design",
              status: "blocked",
            },
            "context/features/001.feat.alpha/003.spec.api.md": {
              title: "API",
              status: "new",
            },
          },
        },
      },
    })
    const tree = buildNextTree(project, null)

    expect(treeText(tree)).toBe(
      ["feat 1 Alpha (new)", "  spec 3 API (new)"].join("\n"),
    )
  })

  it("includes blocked documents with withBlocked option", () => {
    const { project } = testProject.setup({
      pmJson: { doctypes: DOCTYPES },
      files: {
        "context/features/001.feat.alpha/001.feat.alpha.md": {
          title: "Alpha",
          status: "new",
          children: {
            "context/features/001.feat.alpha/002.spec.design.md": {
              title: "Design",
              status: "blocked",
            },
            "context/features/001.feat.alpha/003.spec.api.md": {
              title: "API",
              status: "new",
            },
          },
        },
      },
    })
    const tree = buildNextTree(project, null, { withBlocked: true })

    expect(treeText(tree)).toBe(
      [
        "feat 1 Alpha (new)",
        "  spec 2 Design (blocked)",
        "  spec 3 API (new)",
      ].join("\n"),
    )
  })

  it("orders parents before children, siblings by ID", () => {
    const { project } = testProject.setup(FULL_SETUP)
    const tree = buildNextTree(project, null)

    const ids = tree.map((e) => e.document.id)
    // feat 1 before its children, feat 8 after feat 1's subtree
    expect(ids.indexOf(1)).toBeLessThan(ids.indexOf(2))
    expect(ids.indexOf(2)).toBeLessThan(ids.indexOf(4))
    expect(ids.indexOf(4)).toBeLessThan(ids.indexOf(5))
    expect(ids.indexOf(5)).toBeLessThan(ids.indexOf(6))
    expect(ids.indexOf(6)).toBeLessThan(ids.indexOf(7))
    expect(ids.indexOf(7)).toBeLessThan(ids.indexOf(8))
    expect(ids.indexOf(8)).toBeLessThan(ids.indexOf(9))
  })

  it("shows deep intermediaries with custom done/blocked statuses across 4 levels", () => {
    // A(epic) > B(story) > C(spec) > D(task)
    // A is "closed" (done), B is "on-hold" (blocked), C is "shipped" (done), D is "todo" (active)
    // D is actionable, so A, B, C all appear as intermediaries with their actual statuses
    const { project } = testProject.setup({
      pmJson: {
        doctypes: {
          epic: {
            tag: "epic",
            dir: "epics",
            intermediateDir: true,
            doneStatuses: ["closed"],
            blockedStatuses: ["on-hold"],
          },
          story: {
            tag: "story",
            dir: ".",
            parent: "epic",
            doneStatuses: ["closed"],
            blockedStatuses: ["on-hold"],
          },
          spec: {
            tag: "spec",
            dir: ".",
            parent: "story",
            doneStatuses: ["shipped"],
            blockedStatuses: ["waiting"],
          },
          task: {
            tag: "task",
            dir: ".",
            parent: "spec",
            doneStatuses: ["complete"],
            blockedStatuses: ["stuck"],
          },
        },
      },
      files: {
        "epics/001.epic.platform/001.epic.platform.md": {
          title: "Platform",
          status: "closed",
          children: {
            "epics/001.epic.platform/002.story.auth.md": {
              title: "Auth",
              status: "on-hold",
              children: {
                "epics/001.epic.platform/003.spec.login.md": {
                  title: "Login",
                  status: "shipped",
                  children: {
                    "epics/001.epic.platform/004.task.implement.md": {
                      title: "Implement",
                      status: "todo",
                    },
                  },
                },
              },
            },
          },
        },
      },
    })
    const tree = buildNextTree(project, null)

    expect(treeText(tree)).toBe(
      [
        "epic 1 Platform (closed)",
        "  story 2 Auth (on-hold)",
        "    spec 3 Login (shipped)",
        "      task 4 Implement (todo)",
      ].join("\n"),
    )
  })

  it("handles multiple root documents at depth 0", () => {
    const { project } = testProject.setup(FULL_SETUP)
    const tree = buildNextTree(project, null)

    const roots = tree.filter((e) => e.depth === 0)
    expect(roots).toHaveLength(2)
    expect(roots[0].document.id).toBe(1)
    expect(roots[1].document.id).toBe(8)
  })
})
