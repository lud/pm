import { describe, it, expect } from "vitest"
import { join } from "node:path"
import { resolveProject } from "../lib/project.js"
import { getProjectInfo } from "./info.js"

function projectWith(
  doctypes: Record<string, unknown>,
): ReturnType<typeof resolveProject> {
  return resolveProject({ doctypes }, "/tmp/.pm.json")
}

describe("getProjectInfo", () => {
  it("formats default doctypes", () => {
    const project = projectWith({
      feature: { dir: "context/features" },
    })
    const output = getProjectInfo(project)

    // Header present
    expect(output).toContain("NAME")
    expect(output).toContain("TAG")
    expect(output).toContain("DONE STATUSES")

    // Feature row
    expect(output).toContain("feature")
    expect(output).toContain("feat")
    expect(output).toContain("(root)")
    expect(output).toContain("context/features")

    // Spec row
    expect(output).toContain("spec")
    expect(output).toContain("→ feature")
    expect(output).toContain("(parent dir)")
    expect(output).toContain("done")

    // Task row
    expect(output).toContain("task")
    expect(output).toContain("→ spec")
  })

  it("sorts root doctypes before child doctypes", () => {
    const project = projectWith({
      feature: { dir: "context/features" },
    })
    const output = getProjectInfo(project)
    const lines = output.split("\n")

    // Find row positions (skip header)
    const featureLine = lines.findIndex((l) => l.includes("feature"))
    const specLine = lines.findIndex((l) => l.includes("spec"))
    const taskLine = lines.findIndex((l) => l.includes("task"))

    expect(featureLine).toBeLessThan(specLine)
    expect(specLine).toBeLessThan(taskLine)
  })

  it("handles custom doctypes", () => {
    const project = projectWith({
      feature: null,
      spec: null,
      task: null,
      epic: {
        tag: "epic",
        dir: "epics",
        doneStatuses: ["closed"],
        requireParent: false,
      },
      story: {
        tag: "story",
        dir: ".",
        parent: "epic",
        doneStatuses: ["done", "wontfix"],
      },
    })
    const output = getProjectInfo(project)

    expect(output).toContain("epic")
    expect(output).toContain("(root)")
    expect(output).toContain("closed")

    expect(output).toContain("story")
    expect(output).toContain("→ epic")
    expect(output).toContain("done, wontfix")

    // Default doctypes should not appear
    expect(output).not.toContain("feat")
    expect(output).not.toContain("spec")
    expect(output).not.toContain("task")
  })

  it("shows dir for doctypes with their own directory", () => {
    const project = projectWith({
      feature: { dir: "docs/features" },
    })
    const output = getProjectInfo(project)
    expect(output).toContain("docs/features")
  })
})
