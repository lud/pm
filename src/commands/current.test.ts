import { describe, it, expect, vi, afterEach } from "vitest"
import { join } from "node:path"
import { writeFileSync } from "node:fs"
import { cli } from "cleye"
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

vi.mock("../lib/project.js", async () => {
  const actual = (await vi.importActual("../lib/project.js")) as Record<
    string,
    unknown
  >
  return { ...actual, loadProjectFrom: vi.fn() }
})

import * as cliMod from "../lib/cli.js"
import { loadProjectFrom } from "../lib/project.js"
import { currentCommand } from "./current.js"

const testProject = createTestProject("current-cmd")

const BASIC_SETUP = {
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
} as const

function setupMutableProject() {
  const { dir, project } = testProject.setup(BASIC_SETUP)
  vi.spyOn(process, "cwd").mockReturnValue(dir)
  vi.mocked(loadProjectFrom).mockReturnValue(project)
  return dir
}

function infoOutput(): string {
  return vi
    .mocked(cliMod.info)
    .mock.calls.map(([msg]) => msg)
    .join("\n")
}

describe("current command", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it("reports no current document when unset", () => {
    setupMutableProject()

    cli({ name: "pm", commands: [currentCommand] }, undefined, ["current"])
    expect(infoOutput()).toContain("No current document")
  })

  it("sets and displays current document", () => {
    setupMutableProject()

    cli({ name: "pm", commands: [currentCommand] }, undefined, ["current", "1"])

    const output = infoOutput()
    expect(output).toContain("001 feature User authentication (new)")
  })

  it("shows previously set current document", () => {
    setupMutableProject()

    // Set current
    cli({ name: "pm", commands: [currentCommand] }, undefined, ["current", "2"])
    vi.clearAllMocks()

    // Read current
    cli({ name: "pm", commands: [currentCommand] }, undefined, ["current"])
    const output = infoOutput()
    expect(output).toContain("002 spec Login flow (new)")
    expect(output).toContain("Parents:")
    expect(output).toContain("feature 001 User authentication")
  })

  it("aborts on invalid ID", () => {
    setupMutableProject()

    expect(() =>
      cli({ name: "pm", commands: [currentCommand] }, undefined, [
        "current",
        "abc",
      ]),
    ).toThrow("Invalid document ID")
  })

  it("warns and clears when current document does not exist", () => {
    const dir = setupMutableProject()

    // Write .pm.current directly with a non-existent ID
    writeFileSync(join(dir, ".pm.current"), "999\n")

    // Read current — should warn and clear
    cli({ name: "pm", commands: [currentCommand] }, undefined, ["current"])
    expect(cliMod.warning).toHaveBeenCalledWith(
      expect.stringContaining("not found"),
    )
  })
})
