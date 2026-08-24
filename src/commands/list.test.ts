import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { cli } from "cleye"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { parseFrontmatter, prependFrontmatter } from "../lib/frontmatter.js"
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
import { listCommand } from "./list.js"

const testProject = createTestProject("list-cmd")

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
    "docs/001.feat.auth.md": { title: "User authentication", status: "new" },
    "docs/002.task.login.md": {
      parent: "1.feat.auth",
      title: "Login flow",
      status: "new",
    },
    "docs/003.task.jwt.md": {
      parent: "1.feat.auth",
      title: "Add JWT middleware",
      status: "done",
    },
    "docs/004.task.session.md": {
      parent: "1.feat.auth",
      title: "Session store",
      status: "new",
    },
    "docs/005.task.stuck.md": {
      parent: "1.feat.auth",
      title: "Stuck task",
      status: "blocked",
    },
    "docs/006.wild.thing.md": { title: "Wild thing", status: "new" },
    "docs/010.icebox/011.task.later.md": {
      parent: "10.icebox",
      title: "Later task",
      status: "new",
    },
  },
}

function infoLines(): string[] {
  return vi.mocked(cliMod.info).mock.calls.map(([msg]) => msg)
}

describe("list command", () => {
  let dir: string

  beforeEach(() => {
    const setup = testProject.setup(BASIC_SETUP)
    dir = setup.dir
    vi.clearAllMocks()
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(setup.project)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("lists active documents by default", () => {
    cli({ name: "pm", commands: [listCommand] }, undefined, ["list"])
    const lines = infoLines()
    // Doc 3 (jwt) is done and doc 5 (stuck) is blocked, so neither appears
    expect(lines.some((l) => l.includes("User authentication"))).toBe(true)
    expect(lines.some((l) => l.includes("Login flow"))).toBe(true)
    expect(lines.some((l) => l.includes("Session store"))).toBe(true)
    expect(lines.some((l) => l.includes("Add JWT middleware"))).toBe(false)
    expect(lines.some((l) => l.includes("Stuck task"))).toBe(false)
  })

  it("lists done documents with --done", () => {
    cli({ name: "pm", commands: [listCommand] }, undefined, ["list", "--done"])
    const lines = infoLines()
    expect(lines.some((l) => l.includes("Add JWT middleware"))).toBe(true)
    expect(lines.some((l) => l.includes("Session store"))).toBe(false)
  })

  it("lists blocked documents with --blocked", () => {
    cli({ name: "pm", commands: [listCommand] }, undefined, [
      "list",
      "--blocked",
    ])
    const lines = infoLines()
    expect(lines.some((l) => l.includes("Stuck task"))).toBe(true)
    expect(lines.some((l) => l.includes("Session store"))).toBe(false)
  })

  it("lists all documents with --allStatuses", () => {
    cli({ name: "pm", commands: [listCommand] }, undefined, [
      "list",
      "--allStatuses",
    ])
    const lines = infoLines()
    expect(lines.some((l) => l.includes("Add JWT middleware"))).toBe(true)
    expect(lines.some((l) => l.includes("Stuck task"))).toBe(true)
    expect(lines.some((l) => l.includes("Session store"))).toBe(true)
  })

  it("filters by type name with --type", () => {
    cli({ name: "pm", commands: [listCommand] }, undefined, [
      "list",
      "--type",
      "task",
    ])
    const lines = infoLines()
    expect(lines.some((l) => l.includes("Session store"))).toBe(true)
    expect(lines.some((l) => l.includes("Login flow"))).toBe(true)
    expect(lines.some((l) => l.includes("User authentication"))).toBe(false)
  })

  it("filters by tag with --type", () => {
    cli({ name: "pm", commands: [listCommand] }, undefined, [
      "list",
      "--type",
      "feat",
    ])
    const lines = infoLines()
    expect(lines.some((l) => l.includes("User authentication"))).toBe(true)
    expect(lines.some((l) => l.includes("Login flow"))).toBe(false)
  })

  it("filters by raw undeclared tag with --type", () => {
    cli({ name: "pm", commands: [listCommand] }, undefined, [
      "list",
      "--type",
      "wild",
    ])
    const lines = infoLines()
    expect(lines.some((l) => l.includes("Wild thing"))).toBe(true)
    expect(lines.some((l) => l.includes("User authentication"))).toBe(false)
  })

  it("does not abort on an unknown --type value, just matches nothing", () => {
    cli({ name: "pm", commands: [listCommand] }, undefined, [
      "list",
      "--type",
      "nonexistent",
    ])
    const lines = infoLines()
    expect(lines).toEqual([])
  })

  it("filters by parent with a document ID", () => {
    cli({ name: "pm", commands: [listCommand] }, undefined, [
      "list",
      "--parent",
      "1",
    ])
    const lines = infoLines()
    expect(lines.some((l) => l.includes("Login flow"))).toBe(true)
    expect(lines.some((l) => l.includes("Session store"))).toBe(true)
    expect(lines.some((l) => l.includes("User authentication"))).toBe(false)
  })

  it("filters by parent with a group ID", () => {
    cli({ name: "pm", commands: [listCommand] }, undefined, [
      "list",
      "--parent",
      "10",
    ])
    const lines = infoLines()
    expect(lines.some((l) => l.includes("Later task"))).toBe(true)
    expect(lines.some((l) => l.includes("User authentication"))).toBe(false)
  })

  it("filters by exact status with --status, bypassing the active-only default", () => {
    cli({ name: "pm", commands: [listCommand] }, undefined, [
      "list",
      "--status",
      "done",
    ])
    const lines = infoLines()
    expect(lines.some((l) => l.includes("Add JWT middleware"))).toBe(true)
    expect(lines.some((l) => l.includes("Session store"))).toBe(false)
  })

  it("includes status in output", () => {
    cli({ name: "pm", commands: [listCommand] }, undefined, ["list"])
    const lines = infoLines()
    const featureLine = lines.find((l) => l.includes("User authentication"))
    expect(featureLine).toContain("(new)")
  })

  it("aborts on invalid parent ID", () => {
    expect(() =>
      cli({ name: "pm", commands: [listCommand] }, undefined, [
        "list",
        "--parent",
        "abc",
      ]),
    ).toThrow('Invalid parent ID: "abc"')
  })

  it("filters by typed frontmatter with --is", () => {
    const filePath = join(dir, "docs/004.task.session.md")
    const content = readFileSync(filePath, "utf-8")
    const { data, body } = parseFrontmatter(content)
    writeFileSync(
      filePath,
      prependFrontmatter({ ...data, priority: 2, blocked: false }, body),
    )

    cli({ name: "pm", commands: [listCommand] }, undefined, [
      "list",
      "--is",
      "priority:2",
      "--is",
      "blocked:false",
      "-S",
    ])

    const lines = infoLines()
    expect(lines.some((l) => l.includes("Session store"))).toBe(true)
    expect(lines.some((l) => l.includes("Add JWT middleware"))).toBe(false)
  })

  it("aborts on malformed --is assignment", () => {
    expect(() =>
      cli({ name: "pm", commands: [listCommand] }, undefined, [
        "list",
        "--is",
        "bad",
      ]),
    ).toThrow("Invalid --is format")
  })
})
