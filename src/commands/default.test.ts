import { join } from "node:path"
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
  return {
    ...actual,
    tryLocateProjectFile: vi.fn(),
    loadProjectFile: vi.fn(),
  }
})

import { loadProjectFile, tryLocateProjectFile } from "../core/config.js"
import * as cliMod from "../lib/cli.js"
import { runDefaultCommand } from "./default.js"

const testProject = createTestProject("default-cmd")

const PM_JSON = {
  directory: "docs",
  types: {
    feature: { tag: "feat" },
    task: { tag: "task" },
  },
}

describe("default command", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("suggests pm init when no project found", () => {
    vi.spyOn(process, "cwd").mockReturnValue("/tmp")
    vi.mocked(tryLocateProjectFile).mockReturnValue(null)

    runDefaultCommand()

    expect(cliMod.info).toHaveBeenCalledWith(expect.stringContaining("pm init"))
    expect(loadProjectFile).not.toHaveBeenCalled()
  })

  it("shows status summary when a project exists", () => {
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
    const pmJsonPath = join(dir, "pm.json")
    vi.mocked(tryLocateProjectFile).mockReturnValue(pmJsonPath)
    vi.mocked(loadProjectFile).mockReturnValue(project)

    runDefaultCommand()

    const calls = vi.mocked(cliMod.info).mock.calls.map(([msg]) => msg)
    const output = calls.join("\n")
    expect(output).toContain("feature")
    expect(output).toContain("task")
    expect(output).toContain("new")
  })

  it("aborts when the project fails to load", () => {
    vi.spyOn(process, "cwd").mockReturnValue("/some/dir")
    vi.mocked(tryLocateProjectFile).mockReturnValue("/some/dir/pm.json")
    vi.mocked(loadProjectFile).mockImplementation(() => {
      throw new Error("Invalid JSON in /some/dir/pm.json")
    })

    expect(() => runDefaultCommand()).toThrow(
      "Invalid JSON in /some/dir/pm.json",
    )
  })
})
