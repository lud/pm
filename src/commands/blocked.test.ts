import { readFileSync } from "node:fs"
import { join } from "node:path"
import { cli } from "cleye"
import { afterEach, describe, expect, it, vi } from "vitest"
import { parseFrontmatter } from "../lib/frontmatter.js"
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
import { blockedCommand } from "./blocked.js"

const testProject = createTestProject("blocked-cmd")

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

describe("blocked command", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("marks a document as blocked", () => {
    vi.clearAllMocks()
    const { dir, project } = testProject.setup(BASIC_SETUP)
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)

    // Doc 4 (session-store) has status "new"
    cli({ name: "pm", commands: [blockedCommand] }, undefined, ["blocked", "4"])

    // Verify the file was updated
    const content = readFileSync(
      join(
        dir,
        "context/features/001.feat.user-auth/004.task.session-store.md",
      ),
      "utf-8",
    )
    const { data } = parseFrontmatter(content)
    expect(data.status).toBe("blocked")

    // Verify success output
    expect(cliMod.success).toHaveBeenCalledWith(
      expect.stringContaining("blocked"),
    )
  })

  it("aborts on non-existent document", () => {
    vi.clearAllMocks()
    const { dir, project } = testProject.setup(BASIC_SETUP)
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)

    expect(() =>
      cli({ name: "pm", commands: [blockedCommand] }, undefined, [
        "blocked",
        "999",
      ]),
    ).toThrow()
  })

  it("aborts on invalid ID", () => {
    vi.clearAllMocks()
    const { dir, project } = testProject.setup(BASIC_SETUP)
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)

    expect(() =>
      cli({ name: "pm", commands: [blockedCommand] }, undefined, [
        "blocked",
        "abc",
      ]),
    ).toThrow("Invalid document ID")
  })
})
