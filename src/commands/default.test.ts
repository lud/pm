import { describe, it, expect, vi, afterEach } from "vitest"
import { join } from "node:path"
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
  return {
    ...actual,
    tryLocateProjectFile: vi.fn(),
    loadProjectFile: vi.fn(),
  }
})

import * as cliMod from "../lib/cli.js"
import { tryLocateProjectFile, loadProjectFile } from "../lib/project.js"
import { runDefaultCommand } from "./default.js"

const testProject = createTestProject("default-cmd")

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

describe("default command", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it("suggests pm init when no project found", () => {
    vi.spyOn(process, "cwd").mockReturnValue("/tmp")
    vi.mocked(tryLocateProjectFile).mockReturnValue(null)

    runDefaultCommand()

    expect(cliMod.info).toHaveBeenCalledWith(expect.stringContaining("pm init"))
  })

  it("shows status summary when project exists", () => {
    const { dir, project } = testProject.setup(BASIC_SETUP)
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    const pmJson = join(dir, ".pm.json")
    vi.mocked(tryLocateProjectFile).mockReturnValue(pmJson)
    vi.mocked(loadProjectFile).mockReturnValue(project)

    runDefaultCommand()

    const calls = vi.mocked(cliMod.info).mock.calls.map(([msg]) => msg)
    const output = calls.join("\n")
    expect(output).toContain("feature:")
    expect(output).toContain("new")
  })
})
