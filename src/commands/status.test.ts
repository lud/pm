import { cli } from "cleye"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestProject } from "../lib/test-setup.js"

vi.mock("../lib/cli.js", async () => {
  const actual = (await vi.importActual("../lib/cli.js")) as Record<
    string,
    unknown
  >
  return {
    ...actual,
    write: vi.fn(),
    writeln: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    debug: vi.fn(),
    abort: vi.fn(() => {
      throw new Error("abort")
    }),
    abortError: vi.fn((msg: string) => {
      throw new Error(msg)
    }),
  }
})

vi.mock("../core/config.js", async () => {
  const actual = (await vi.importActual("../core/config.js")) as Record<
    string,
    unknown
  >
  return { ...actual, loadProjectFrom: vi.fn() }
})

import { loadProjectFrom } from "../core/config.js"
import * as cliMod from "../lib/cli.js"
import { statusCommand } from "./status.js"

const testProject = createTestProject("status-cmd")

const PM_JSON = {
  directory: "docs",
  types: {
    feature: { tag: "feat" },
    task: { tag: "task" },
    decision: {
      tag: "adr",
      defaultStatus: "draft",
      doneStatuses: ["accepted"],
    },
  },
}

function infoLines(): string[] {
  return vi.mocked(cliMod.info).mock.calls.map(([msg]) => msg)
}

function infoOutput(): string {
  return infoLines().join("\n")
}

function warningLines(): string[] {
  return vi.mocked(cliMod.warning).mock.calls.map(([msg]) => msg)
}

describe("status command", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("shows status summary for basic project", () => {
    const { dir, project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/001.feat.auth.md": { title: "Auth", status: "new" },
        "docs/002.task.login.md": {
          parent: "1.feat.auth",
          title: "Login",
          status: "new",
        },
      },
    })
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)

    cli({ name: "pm", commands: [statusCommand] }, undefined, ["status"])
    const output = infoOutput()
    expect(output).toContain("feature")
    expect(output).toContain("task")
    expect(output).toContain("new")
  })

  it("shows the status breakdown with per-type done statuses", () => {
    const { dir, project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/001.feat.auth.md": { title: "Auth", status: "in-progress" },
        "docs/002.task.login.md": {
          parent: "1.feat.auth",
          title: "Login",
          status: "new",
        },
        "docs/003.task.jwt.md": {
          parent: "1.feat.auth",
          title: "JWT",
          status: "done",
        },
        "docs/004.adr.choice.md": { title: "Choice", status: "accepted" },
        "docs/005.adr.other.md": { title: "Other", status: "draft" },
      },
    })
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)

    cli({ name: "pm", commands: [statusCommand] }, undefined, ["status"])
    const output = infoOutput()
    expect(output).toContain("feature")
    expect(output).toContain("task")
    expect(output).toContain("decision")
    // the adr type's own doneStatuses (["accepted"]) mark this status done,
    // even though the literal string isn't "done"
    expect(output).toContain("accepted [done]")
    expect(output).toContain("draft")
  })

  it("prints legacy-config warnings before the breakdown", () => {
    const { dir, project } = testProject.setup({
      pmJson: {
        directory: "docs",
        doctypes: {
          feature: { tag: "feat" },
        },
      },
      files: {
        "docs/001.feat.auth.md": { title: "Auth", status: "new" },
      },
    })
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)

    cli({ name: "pm", commands: [statusCommand] }, undefined, ["status"])
    expect(warningLines().join("\n")).toContain("doctypes")
  })

  it("shows the current-document section when current is a doc", () => {
    const { dir, project } = testProject.setup({
      pmJson: PM_JSON,
      pmCurrent: 2,
      files: {
        "docs/001.feat.auth.md": { title: "Auth", status: "new" },
        "docs/002.task.login.md": {
          parent: "1.feat.auth",
          title: "Login",
          status: "new",
        },
      },
    })
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)

    cli({ name: "pm", commands: [statusCommand] }, undefined, ["status"])
    const output = infoOutput()
    expect(output).toContain("Current document:")
    expect(output).toContain("002 task Login (new)")
    expect(output).toContain("Parents:")
    expect(output).toContain("feature 001 Auth (new)")
  })

  it("shows the current-document section when current is a group", () => {
    const { dir, project } = testProject.setup({
      pmJson: PM_JSON,
      pmCurrent: 10,
      files: {
        "docs/010.stuff/011.task.a.md": {
          parent: "10.stuff",
          title: "A",
          status: "new",
        },
      },
    })
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)

    cli({ name: "pm", commands: [statusCommand] }, undefined, ["status"])
    const output = infoOutput()
    expect(output).toContain("Current document:")
    expect(output).toContain("010 group stuff")
    expect(output).toContain("Children:")
    expect(output).toContain("task 011 A (new)")
  })

  it("warns when the current document ID no longer resolves", () => {
    const { dir, project } = testProject.setup({
      pmJson: PM_JSON,
      pmCurrent: 99,
      files: {
        "docs/001.feat.auth.md": { title: "Auth", status: "new" },
      },
    })
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)

    cli({ name: "pm", commands: [statusCommand] }, undefined, ["status"])
    expect(warningLines().join("\n")).toContain("Current document 99 not found")
  })
})
