import { existsSync, readFileSync } from "node:fs"
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

vi.mock("../core/config.js", async () => {
  const actual = (await vi.importActual("../core/config.js")) as Record<
    string,
    unknown
  >
  return { ...actual, loadProjectFrom: vi.fn() }
})

import { loadProjectFrom } from "../core/config.js"
import * as cliMod from "../lib/cli.js"
import { doneCommand } from "./done.js"

const testProject = createTestProject("done-cmd")

const PM_JSON = {
  directory: "docs",
  types: {
    feature: { tag: "feat" },
    task: { tag: "task" },
    decision: {
      tag: "adr",
      defaultStatus: "draft",
      doneStatuses: ["accepted", "rejected"],
    },
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
      status: "in-progress",
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

describe("done command", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("marks a document as done", () => {
    vi.clearAllMocks()
    const setup = testProject.setup(BASIC_SETUP)
    dir = setup.dir
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(setup.project)

    // Doc 4 (session-store) has status "new"
    cli({ name: "pm", commands: [doneCommand] }, undefined, ["done", "4"])

    const content = readFileSync(
      join(dir, "docs/004.task.session-store.md"),
      "utf-8",
    )
    const { data } = parseFrontmatter(content)
    expect(data.status).toBe("done")

    expect(cliMod.success).toHaveBeenCalledWith(expect.stringContaining("done"))
  })

  it("marks done with the per-type done status", () => {
    vi.clearAllMocks()
    const setup = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/005.adr.pick-db.md": {
          title: "Pick a database",
          status: "draft",
          created_on: "2026-03-21",
        },
      },
    })
    dir = setup.dir
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(setup.project)

    cli({ name: "pm", commands: [doneCommand] }, undefined, ["done", "5"])

    const content = readFileSync(join(dir, "docs/005.adr.pick-db.md"), "utf-8")
    const { data } = parseFrontmatter(content)
    expect(data.status).toBe("accepted")
    expect(cliMod.success).toHaveBeenCalledWith(
      expect.stringContaining("accepted"),
    )
  })

  it("aborts on non-existent document", () => {
    vi.clearAllMocks()
    const setup = testProject.setup(BASIC_SETUP)
    dir = setup.dir
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(setup.project)

    expect(() =>
      cli({ name: "pm", commands: [doneCommand] }, undefined, ["done", "999"]),
    ).toThrow()
  })

  it("aborts on a group ID", () => {
    vi.clearAllMocks()
    const setup = testProject.setup({
      pmJson: PM_JSON,
      dirs: ["docs/010.backlog"],
    })
    dir = setup.dir
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(setup.project)

    expect(() =>
      cli({ name: "pm", commands: [doneCommand] }, undefined, ["done", "10"]),
    ).toThrow(/group/i)
  })

  it("aborts on invalid ID", () => {
    vi.clearAllMocks()
    const setup = testProject.setup(BASIC_SETUP)
    dir = setup.dir
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(setup.project)

    expect(() =>
      cli({ name: "pm", commands: [doneCommand] }, undefined, ["done", "abc"]),
    ).toThrow("Invalid document ID")
  })

  it("prints unblocked documents", () => {
    vi.clearAllMocks()
    const setup = testProject.setup({
      ...BASIC_SETUP,
      files: {
        ...BASIC_SETUP.files,
        "docs/004.task.session-store.md": {
          parent: "2.spec.login-flow",
          title: "Session store",
          status: "blocked",
          blocked_by: "3.task.jwt-middleware",
          created_on: "2026-03-21",
        },
      },
    })
    dir = setup.dir
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(setup.project)

    // Mark doc 3 as done — should unblock doc 4
    cli({ name: "pm", commands: [doneCommand] }, undefined, ["done", "3"])

    expect(cliMod.success).toHaveBeenCalledTimes(2)
    expect(cliMod.success).toHaveBeenCalledWith(expect.stringContaining("done"))
    expect(cliMod.success).toHaveBeenCalledWith(
      expect.stringContaining("unblocked"),
    )
  })

  it("clears .pm.current and prints a message when the done doc is current", () => {
    vi.clearAllMocks()
    const setup = testProject.setup({ ...BASIC_SETUP, pmCurrent: 4 })
    dir = setup.dir
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(setup.project)

    expect(existsSync(join(dir, ".pm.current"))).toBe(true)

    cli({ name: "pm", commands: [doneCommand] }, undefined, ["done", "4"])

    expect(existsSync(join(dir, ".pm.current"))).toBe(false)
    expect(cliMod.info).toHaveBeenCalledWith("Cleared current document.")
  })

  it("does not clear .pm.current when a different doc is current", () => {
    vi.clearAllMocks()
    const setup = testProject.setup({ ...BASIC_SETUP, pmCurrent: 1 })
    dir = setup.dir
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(setup.project)

    cli({ name: "pm", commands: [doneCommand] }, undefined, ["done", "4"])

    expect(existsSync(join(dir, ".pm.current"))).toBe(true)
    expect(cliMod.info).not.toHaveBeenCalledWith("Cleared current document.")
  })
})
