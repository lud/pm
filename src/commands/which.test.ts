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
import { whichCommand } from "./which.js"

const testProject = createTestProject("which-cmd")

const PM_JSON = {
  directory: "docs",
  types: {
    feature: { tag: "feat" },
    spec: { tag: "spec" },
    task: { tag: "task" },
  },
}

const BASIC_SETUP = {
  pmJson: PM_JSON,
  files: {
    "docs/001.feat.user-auth.md": {
      title: "User authentication",
      status: "new",
      created_on: "2026-03-20",
    },
    "docs/002.spec.login-flow.md": {
      parent: "1.feat.user-auth",
      title: "Login flow",
      status: "new",
      created_on: "2026-03-20",
    },
    "docs/003.task.jwt-middleware.md": {
      parent: "2.spec.login-flow",
      title: "Add JWT middleware",
      status: "done",
      created_on: "2026-03-21",
    },
    "docs/004.task.session-store.md": {
      parent: "2.spec.login-flow",
      title: "Session store",
      status: "new",
      created_on: "2026-03-21",
    },
  },
} as const

let dir: string

describe("which command", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const setup = testProject.setup(BASIC_SETUP)
    dir = setup.dir
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(setup.project)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("outputs the absolute project directory when no args", () => {
    cli({ name: "pm", commands: [whichCommand] }, undefined, ["which"])
    expect(cliMod.info).toHaveBeenCalledWith(dir)
  })

  it("outputs the path of a document by ID", () => {
    cli({ name: "pm", commands: [whichCommand] }, undefined, ["which", "1"])
    expect(cliMod.info).toHaveBeenCalledWith("docs/001.feat.user-auth.md")
  })

  it("accepts zero-padded IDs", () => {
    cli({ name: "pm", commands: [whichCommand] }, undefined, ["which", "002"])
    expect(cliMod.info).toHaveBeenCalledWith("docs/002.spec.login-flow.md")
  })

  it("outputs multiple document paths", () => {
    cli({ name: "pm", commands: [whichCommand] }, undefined, [
      "which",
      "1",
      "3",
    ])
    expect(cliMod.info).toHaveBeenCalledTimes(2)
    expect(cliMod.info).toHaveBeenNthCalledWith(1, "docs/001.feat.user-auth.md")
    expect(cliMod.info).toHaveBeenNthCalledWith(
      2,
      "docs/003.task.jwt-middleware.md",
    )
  })

  it("aborts with error for unknown document ID", () => {
    expect(() => {
      cli({ name: "pm", commands: [whichCommand] }, undefined, ["which", "999"])
    }).toThrow("Document 999 not found")
  })

  it("aborts with error for invalid ID", () => {
    expect(() => {
      cli({ name: "pm", commands: [whichCommand] }, undefined, ["which", "abc"])
    }).toThrow('Invalid document ID: "abc"')
  })

  it("aborts on first unknown ID, skipping remaining", () => {
    expect(() => {
      cli({ name: "pm", commands: [whichCommand] }, undefined, [
        "which",
        "1",
        "999",
        "2",
      ])
    }).toThrow("Document 999 not found")
    // Only the first document's path was output before the error
    expect(cliMod.info).toHaveBeenCalledTimes(1)
  })

  it("resolves a group ID to its directory path", () => {
    const setup = testProject.setup({
      pmJson: PM_JSON,
      dirs: ["docs/010.backlog"],
    })
    vi.spyOn(process, "cwd").mockReturnValue(setup.dir)
    vi.mocked(loadProjectFrom).mockReturnValue(setup.project)

    cli({ name: "pm", commands: [whichCommand] }, undefined, ["which", "10"])
    expect(cliMod.info).toHaveBeenCalledWith("docs/010.backlog")
  })
})
