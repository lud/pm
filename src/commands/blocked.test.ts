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

vi.mock("../core/config.js", async () => {
  const actual = (await vi.importActual("../core/config.js")) as Record<
    string,
    unknown
  >
  return { ...actual, loadProjectFrom: vi.fn() }
})

import { loadProjectFrom } from "../core/config.js"
import * as cliMod from "../lib/cli.js"
import { blockedCommand } from "./blocked.js"

const testProject = createTestProject("blocked-cmd")

const PM_JSON = {
  directory: "docs",
  types: {
    feature: { tag: "feat" },
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

describe("blocked command", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("marks a document as blocked", () => {
    vi.clearAllMocks()
    const setup = testProject.setup(BASIC_SETUP)
    dir = setup.dir
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(setup.project)

    // Doc 4 (session-store) has status "new"
    cli({ name: "pm", commands: [blockedCommand] }, undefined, ["blocked", "4"])

    const content = readFileSync(
      join(dir, "docs/004.task.session-store.md"),
      "utf-8",
    )
    const { data } = parseFrontmatter(content)
    expect(data.status).toBe("blocked")

    expect(cliMod.success).toHaveBeenCalledWith(
      expect.stringContaining("blocked"),
    )
  })

  it("aborts on non-existent document", () => {
    vi.clearAllMocks()
    const setup = testProject.setup(BASIC_SETUP)
    dir = setup.dir
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(setup.project)

    expect(() =>
      cli({ name: "pm", commands: [blockedCommand] }, undefined, [
        "blocked",
        "999",
      ]),
    ).toThrow()
  })

  it("aborts on invalid ID", () => {
    vi.clearAllMocks()
    const setup = testProject.setup(BASIC_SETUP)
    dir = setup.dir
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(setup.project)

    expect(() =>
      cli({ name: "pm", commands: [blockedCommand] }, undefined, [
        "blocked",
        "abc",
      ]),
    ).toThrow("Invalid document ID")
  })

  it("sets blocked_by with --by referencing a doc", () => {
    vi.clearAllMocks()
    const setup = testProject.setup(BASIC_SETUP)
    dir = setup.dir
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(setup.project)

    cli({ name: "pm", commands: [blockedCommand] }, undefined, [
      "blocked",
      "4",
      "--by",
      "3",
    ])

    const content = readFileSync(
      join(dir, "docs/004.task.session-store.md"),
      "utf-8",
    )
    const { data } = parseFrontmatter(content)
    expect(data.status).toBe("blocked")
    expect(data.blocked_by).toBe("003.task.jwt-middleware")
    expect(cliMod.info).not.toHaveBeenCalledWith(expect.stringContaining("Tip"))
  })

  it("sets blocked_by with --by referencing a group", () => {
    vi.clearAllMocks()
    const setup = testProject.setup({
      pmJson: PM_JSON,
      dirs: ["docs/010.stuff"],
      files: {
        "docs/004.task.session-store.md": {
          title: "Session store",
          status: "new",
          created_on: "2026-03-21",
        },
      },
    })
    dir = setup.dir
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(setup.project)

    cli({ name: "pm", commands: [blockedCommand] }, undefined, [
      "blocked",
      "4",
      "--by",
      "10",
    ])

    const content = readFileSync(
      join(dir, "docs/004.task.session-store.md"),
      "utf-8",
    )
    const { data } = parseFrontmatter(content)
    expect(data.status).toBe("blocked")
    expect(data.blocked_by).toBe("010.stuff")
  })

  it("prints tip when --by is not provided", () => {
    vi.clearAllMocks()
    const setup = testProject.setup(BASIC_SETUP)
    dir = setup.dir
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(setup.project)

    cli({ name: "pm", commands: [blockedCommand] }, undefined, ["blocked", "4"])

    expect(cliMod.info).toHaveBeenCalledWith(
      "Tip: use --by <id> to reference the blocking document",
    )
  })

  it("aborts on invalid --by ID", () => {
    vi.clearAllMocks()
    const setup = testProject.setup(BASIC_SETUP)
    dir = setup.dir
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(setup.project)

    expect(() =>
      cli({ name: "pm", commands: [blockedCommand] }, undefined, [
        "blocked",
        "4",
        "--by",
        "abc",
      ]),
    ).toThrow("Invalid document ID")
  })

  it("aborts when --by references an unknown blocker", () => {
    vi.clearAllMocks()
    const setup = testProject.setup(BASIC_SETUP)
    dir = setup.dir
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(setup.project)

    expect(() =>
      cli({ name: "pm", commands: [blockedCommand] }, undefined, [
        "blocked",
        "4",
        "--by",
        "999",
      ]),
    ).toThrow("Blocking node 999 not found")
  })
})
