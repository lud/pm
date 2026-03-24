import { cli } from "cleye"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createTestProject, type TestSetup } from "../lib/test-setup.js"

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

vi.mock("../lib/project.js", async () => {
  const actual = (await vi.importActual("../lib/project.js")) as Record<
    string,
    unknown
  >
  return { ...actual, loadProjectFrom: vi.fn() }
})

import * as cliMod from "../lib/cli.js"
import { loadProjectFrom } from "../lib/project.js"
import { nextCommand } from "./next.js"

const testProject = createTestProject("next-cmd")

const DOCTYPES = {
  feature: { tag: "feat", dir: "context/features", intermediateDir: true },
  spec: { tag: "spec", dir: ".", parent: "feature" },
  task: { tag: "task", dir: ".", parent: "spec" },
}

const SETUP: TestSetup = {
  pmJson: { doctypes: DOCTYPES },
  pmCurrent: 4,
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
  },
}

function infoOutput(): string {
  return vi
    .mocked(cliMod.info)
    .mock.calls.map(([msg]) => msg)
    .join("\n")
}

describe("next command", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it("shows the next document", () => {
    const { dir, project } = testProject.setup(SETUP)
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)

    cli({ name: "pm", commands: [nextCommand] }, undefined, ["next"])

    const output = infoOutput()
    expect(output).toContain("005 task Third (new)")
    expect(output).toContain("in context/features/")
  })

  it("shows no-next message when exhausted", () => {
    const { dir, project } = testProject.setup({
      pmJson: { doctypes: DOCTYPES },
      pmCurrent: 4,
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
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)

    cli({ name: "pm", commands: [nextCommand] }, undefined, ["next"])

    expect(infoOutput()).toContain("No next document found")
  })

  it("aborts when no current document set", () => {
    const { dir, project } = testProject.setup({
      pmJson: { doctypes: DOCTYPES },
      files: {
        "context/features/001.feat.alpha/001.feat.alpha.md": {
          title: "Alpha",
          status: "new",
        },
      },
    })
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)

    expect(() =>
      cli({ name: "pm", commands: [nextCommand] }, undefined, ["next"]),
    ).toThrow("No current document set")
  })

  it("emits debug events in verbose mode", () => {
    const { dir, project } = testProject.setup(SETUP)
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)

    cli({ name: "pm", commands: [nextCommand] }, undefined, [
      "next",
      "--verbose",
    ])
  })
})
