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

vi.mock("../lib/project.js", async () => {
  const actual = (await vi.importActual("../lib/project.js")) as Record<
    string,
    unknown
  >
  return { ...actual, loadProjectFrom: vi.fn() }
})

import * as cliMod from "../lib/cli.js"
import { loadProjectFrom } from "../lib/project.js"
import { readCommand } from "./read.js"

const testProject = createTestProject("read-cmd")

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

describe("read command", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const { dir, project } = testProject.setup(BASIC_SETUP)
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("outputs raw file content", () => {
    cli({ name: "pm", commands: [readCommand] }, undefined, ["read", "1"])
    expect(cliMod.write).toHaveBeenCalledWith(
      expect.stringContaining("title: User authentication"),
    )
  })

  it("includes frontmatter in output", () => {
    cli({ name: "pm", commands: [readCommand] }, undefined, ["read", "1"])
    const content = vi.mocked(cliMod.write).mock.calls[0][0]
    expect(content).toMatch(/^---\n/)
  })

  it("aborts on non-existent document", () => {
    expect(() =>
      cli({ name: "pm", commands: [readCommand] }, undefined, ["read", "999"]),
    ).toThrow("Document 999 not found")
  })

  it("aborts on invalid ID", () => {
    expect(() =>
      cli({ name: "pm", commands: [readCommand] }, undefined, ["read", "xyz"]),
    ).toThrow("Invalid document ID")
  })
})
