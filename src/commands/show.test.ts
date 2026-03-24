import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
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
import { showCommand } from "./show.js"

const testProject = createTestProject("show-cmd")

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

describe("show command", () => {
  let dir: string

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

  it("displays document properties", () => {
    cli({ name: "pm", commands: [showCommand] }, undefined, ["show", "1"])
    expect(cliMod.info).toHaveBeenCalledWith("doctype: feature")
    expect(cliMod.info).toHaveBeenCalledWith("id: 1")
    expect(cliMod.info).toHaveBeenCalledWith("title: User authentication")
    expect(cliMod.info).toHaveBeenCalledWith("status: new")
  })

  it("displays relative path", () => {
    cli({ name: "pm", commands: [showCommand] }, undefined, ["show", "1"])
    expect(cliMod.info).toHaveBeenCalledWith(
      expect.stringMatching(/^path: context\/features\//),
    )
  })

  it("shows children of a feature", () => {
    cli({ name: "pm", commands: [showCommand] }, undefined, ["show", "1"])
    const calls = vi.mocked(cliMod.info).mock.calls.map(([msg]) => msg)
    expect(calls).toContain("Children:")
    // spec 002 is a child of feature 001
    const childLine = calls.find(
      (c) => c.includes("002") && c.includes("Login flow"),
    )
    expect(childLine).toBeDefined()
  })

  it("shows parents of a spec", () => {
    cli({ name: "pm", commands: [showCommand] }, undefined, ["show", "2"])
    const calls = vi.mocked(cliMod.info).mock.calls.map(([msg]) => msg)
    expect(calls).toContain("Parents:")
    const parentLine = calls.find(
      (c) => c.includes("001") && c.includes("User authentication"),
    )
    expect(parentLine).toBeDefined()
  })

  it("accepts zero-padded IDs", () => {
    cli({ name: "pm", commands: [showCommand] }, undefined, ["show", "001"])
    expect(cliMod.info).toHaveBeenCalledWith("id: 1")
  })

  it("aborts on non-existent document", () => {
    expect(() =>
      cli({ name: "pm", commands: [showCommand] }, undefined, ["show", "999"]),
    ).toThrow("Document 999 not found")
  })

  it("aborts on invalid ID", () => {
    expect(() =>
      cli({ name: "pm", commands: [showCommand] }, undefined, ["show", "abc"]),
    ).toThrow("Invalid document ID")
  })
})
