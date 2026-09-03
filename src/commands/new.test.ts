import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { cli } from "cleye"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
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

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}))

import { loadProjectFrom } from "../core/config.js"
import * as cliMod from "../lib/cli.js"
import { newCommand } from "./new.js"

const testProject = createTestProject("new-cmd")

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

describe("new command", () => {
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

  it("creates a new document at the project root", () => {
    cli({ name: "pm", commands: [newCommand] }, undefined, [
      "new",
      "feature",
      "Payment",
      "processing",
    ])

    expect(cliMod.success).toHaveBeenCalledWith(
      expect.stringContaining("Created"),
    )
    // Next ID after 4 should be 5
    const expectedPath = join(dir, "docs/005.feat.payment-processing.md")
    expect(existsSync(expectedPath)).toBe(true)
    const content = readFileSync(expectedPath, "utf-8")
    const { data } = parseFrontmatter(content)
    expect(data.title).toBe("Payment processing")
    expect(data.status).toBe("new")
    expect(data.parent).toBeUndefined()
  })

  it("accepts a type tag as equivalent to its name", () => {
    cli({ name: "pm", commands: [newCommand] }, undefined, [
      "new",
      "feat",
      "Payment",
      "processing",
    ])

    const expectedPath = join(dir, "docs/005.feat.payment-processing.md")
    expect(existsSync(expectedPath)).toBe(true)
  })

  it("aborts on unknown type", () => {
    expect(() =>
      cli({ name: "pm", commands: [newCommand] }, undefined, [
        "new",
        "nonexistent",
        "Title",
      ]),
    ).toThrow('Unknown type "nonexistent"')
  })

  it("creates a document colocated with a parent document", () => {
    cli({ name: "pm", commands: [newCommand] }, undefined, [
      "new",
      "task",
      "OAuth",
      "flow",
      "--parent",
      "2",
    ])

    expect(cliMod.success).toHaveBeenCalledWith(
      expect.stringContaining("Created"),
    )
    const expectedPath = join(dir, "docs/005.task.oauth-flow.md")
    expect(existsSync(expectedPath)).toBe(true)
    const content = readFileSync(expectedPath, "utf-8")
    const { data } = parseFrontmatter(content)
    expect(data.parent).toBe("002.spec.login-flow")
  })

  it("creates a document inside a parent group", () => {
    const setup = testProject.setup({
      pmJson: PM_JSON,
      dirs: ["docs/010.backlog"],
    })
    vi.spyOn(process, "cwd").mockReturnValue(setup.dir)
    vi.mocked(loadProjectFrom).mockReturnValue(setup.project)

    cli({ name: "pm", commands: [newCommand] }, undefined, [
      "new",
      "task",
      "Backlog",
      "item",
      "--parent",
      "10",
    ])

    const expectedPath = join(
      setup.dir,
      "docs/010.backlog/011.task.backlog-item.md",
    )
    expect(existsSync(expectedPath)).toBe(true)
    const content = readFileSync(expectedPath, "utf-8")
    const { data } = parseFrontmatter(content)
    expect(data.parent).toBe("010.backlog")
  })

  it("aborts on invalid parent ID", () => {
    expect(() =>
      cli({ name: "pm", commands: [newCommand] }, undefined, [
        "new",
        "spec",
        "Title",
        "--parent",
        "abc",
      ]),
    ).toThrow('Invalid parent ID: "abc"')
  })

  it("aborts on unknown parent", () => {
    expect(() =>
      cli({ name: "pm", commands: [newCommand] }, undefined, [
        "new",
        "spec",
        "Title",
        "--parent",
        "999",
      ]),
    ).toThrow("Parent 999 not found")
  })

  it("creates with custom status", () => {
    cli({ name: "pm", commands: [newCommand] }, undefined, [
      "new",
      "feature",
      "Dashboard",
      "--status",
      "in-progress",
    ])

    expect(cliMod.success).toHaveBeenCalledWith(
      expect.stringContaining("Created"),
    )
    const expectedPath = join(dir, "docs/005.feat.dashboard.md")
    const content = readFileSync(expectedPath, "utf-8")
    const { data } = parseFrontmatter(content)
    expect(data.status).toBe("in-progress")
  })

  it("sets typed frontmatter properties via --set", () => {
    cli({ name: "pm", commands: [newCommand] }, undefined, [
      "new",
      "feature",
      "Typed",
      "props",
      "--set",
      "priority:2",
      "--set",
      "blocked:TRUE",
      "--set",
      "label:high",
    ])

    const expectedPath = join(dir, "docs/005.feat.typed-props.md")
    const content = readFileSync(expectedPath, "utf-8")
    const { data } = parseFrontmatter(content)

    expect(data.priority).toBe(2)
    expect(data.blocked).toBe(true)
    expect(data.label).toBe("high")
  })

  it("aborts on malformed --set assignment", () => {
    expect(() =>
      cli({ name: "pm", commands: [newCommand] }, undefined, [
        "new",
        "feature",
        "Title",
        "--set",
        "bad",
      ]),
    ).toThrow("Invalid --set format")
  })

  it.each([
    ["id", "id:5", "id is automatically generated"],
    ["title", "title:Foo", "title is created from the command arguments"],
    ["status", "status:done", "use --status done"],
    ["parent", "parent:1", "use --parent 1"],
  ])("aborts when --set targets the reserved %s field", (_key, flag, message) => {
    expect(() =>
      cli({ name: "pm", commands: [newCommand] }, undefined, [
        "new",
        "feature",
        "Title",
        "--set",
        flag,
      ]),
    ).toThrow(message)
  })

  it("warns when --editor is set but no editor configured", () => {
    const origEditor = process.env.EDITOR
    const origPmEditor = process.env.PM_EDITOR
    delete process.env.EDITOR
    delete process.env.PM_EDITOR

    cli({ name: "pm", commands: [newCommand] }, undefined, [
      "new",
      "feature",
      "Test",
      "--editor",
    ])

    expect(cliMod.warning).toHaveBeenCalledWith(
      expect.stringContaining("No editor configured"),
    )

    // Restore
    if (origEditor !== undefined) process.env.EDITOR = origEditor
    if (origPmEditor !== undefined) process.env.PM_EDITOR = origPmEditor
  })
})

describe("new command — guides", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("prints the guide path after creation for a type with a built-in guide", () => {
    const { dir, project } = testProject.setup({
      pmJson: { directory: "docs", types: { feature: { tag: "feat" } } },
      dirs: ["docs"],
    })
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)
    cli({ name: "pm", commands: [newCommand] }, undefined, [
      "new",
      "feature",
      "Guided",
    ])
    const guideLines = vi
      .mocked(cliMod.info)
      .mock.calls.map(([m]) => m)
      .filter((m) => String(m).startsWith("Guide: "))
    expect(guideLines).toHaveLength(1)
    expect(guideLines[0]).toMatch(/type-guides\/feature\.md$/)
  })

  it("prints a read-before-write hint after creation", () => {
    const { dir, project } = testProject.setup({
      pmJson: { directory: "docs", types: { feature: { tag: "feat" } } },
      dirs: ["docs"],
    })
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)
    cli({ name: "pm", commands: [newCommand] }, undefined, [
      "new",
      "feature",
      "Hinted",
    ])
    const lines = vi.mocked(cliMod.info).mock.calls.map(([m]) => String(m))
    expect(lines).toContain(
      "Body is empty: read the file with your file tool before writing it.",
    )
  })

  it("omits the read-before-write hint when opening an editor", () => {
    const { dir, project } = testProject.setup({
      pmJson: { directory: "docs", types: { feature: { tag: "feat" } } },
      dirs: ["docs"],
    })
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)
    const origEditor = process.env.EDITOR
    process.env.EDITOR = "true"
    cli({ name: "pm", commands: [newCommand] }, undefined, [
      "new",
      "feature",
      "Edited",
      "--editor",
    ])
    if (origEditor === undefined) delete process.env.EDITOR
    else process.env.EDITOR = origEditor
    const lines = vi.mocked(cliMod.info).mock.calls.map(([m]) => String(m))
    expect(lines.some((m) => m.startsWith("Body is empty"))).toBe(false)
  })

  it("prints no guide line for a type without one", () => {
    const { dir, project } = testProject.setup({
      pmJson: { directory: "docs", types: { widget: { tag: "wid" } } },
      dirs: ["docs"],
    })
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)
    cli({ name: "pm", commands: [newCommand] }, undefined, [
      "new",
      "widget",
      "Unguided",
    ])
    const lines = vi.mocked(cliMod.info).mock.calls.map(([m]) => String(m))
    expect(lines.some((m) => m.startsWith("Guide: "))).toBe(false)
  })
})
