import { cli } from "cleye"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createTestProject, dedent, type TestSetup } from "../lib/test-setup.js"

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
      },
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

  it("shows tree with current marker", () => {
    const { dir, project } = testProject.setup(SETUP)
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)

    cli({ name: "pm", commands: [nextCommand] }, undefined, ["next"])

    expect(infoOutput()).toBe(
      dedent(`
      feat 001 Alpha (new)
        spec 002 Design (specified)
          task 004 Second (new) [current]
          task 005 Third (new)
      `),
    )
  })

  it("works without a current document", () => {
    const { dir, project } = testProject.setup({
      ...SETUP,
      pmCurrent: undefined,
    })
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)

    cli({ name: "pm", commands: [nextCommand] }, undefined, ["next"])

    const output = infoOutput()
    expect(output).not.toContain("[current]")
    expect(output).toContain("feat 001 Alpha (new)")
  })

  it("shows message when all documents are done", () => {
    const { dir, project } = testProject.setup({
      pmJson: { doctypes: DOCTYPES },
      files: {
        "context/features/001.feat.alpha/001.feat.alpha.md": {
          title: "Alpha",
          status: "done",
        },
      },
    })
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)

    cli({ name: "pm", commands: [nextCommand] }, undefined, ["next"])

    expect(infoOutput()).toBe("No actionable documents found.")
  })

  it("includes blocked documents with --with-blocked", () => {
    const { dir, project } = testProject.setup({
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
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)

    cli({ name: "pm", commands: [nextCommand] }, undefined, [
      "next",
      "--with-blocked",
    ])

    expect(infoOutput()).toBe(
      dedent(`
      feat 001 Alpha (new)
        spec 002 Design (blocked)
        spec 003 API (new)
      `),
    )
  })
})
