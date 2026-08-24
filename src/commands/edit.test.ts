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
import { editCommand } from "./edit.js"

const testProject = createTestProject("edit-cmd")

const PM_JSON = {
  directory: "docs",
  types: {
    feature: { tag: "feat" },
    spec: { tag: "spec" },
    task: { tag: "task" },
    bug: { tag: "bug", blockedStatuses: ["stuck"] },
  },
}

const BASIC_SETUP = {
  pmJson: PM_JSON,
  dirs: ["docs/010.backlog"],
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
    "docs/005.bug.flaky-test.md": {
      title: "Flaky test",
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

function readDoc(dir: string, relPath: string) {
  const content = readFileSync(join(dir, relPath), "utf-8")
  return parseFrontmatter(content).data
}

describe("edit command", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it("sets a property via --set", () => {
    const dir = setupMutableProject()

    cli({ name: "pm", commands: [editCommand] }, undefined, [
      "edit",
      "1",
      "--set",
      "status:in-progress",
    ])

    const data = readDoc(dir, "docs/001.feat.user-auth.md")
    expect(data.status).toBe("in-progress")
    expect(cliMod.success).toHaveBeenCalledWith(
      expect.stringContaining("Updated"),
    )
  })

  it("sets multiple properties", () => {
    const dir = setupMutableProject()

    cli({ name: "pm", commands: [editCommand] }, undefined, [
      "edit",
      "1",
      "--set",
      "status:active",
      "--set",
      "priority:high",
    ])

    const data = readDoc(dir, "docs/001.feat.user-auth.md")
    expect(data.status).toBe("active")
    expect(data.priority).toBe("high")
  })

  it("parses numbers and booleans in --set values", () => {
    const dir = setupMutableProject()

    cli({ name: "pm", commands: [editCommand] }, undefined, [
      "edit",
      "1",
      "--set",
      "count:-2",
      "--set",
      "ratio:3.14",
      "--set",
      "ready:False",
      "--set",
      "weird:123foo",
    ])

    const data = readDoc(dir, "docs/001.feat.user-auth.md")
    expect(data.count).toBe(-2)
    expect(data.ratio).toBe(3.14)
    expect(data.ready).toBe(false)
    expect(data.weird).toBe("123foo")
  })

  it("aborts on invalid --set format", () => {
    setupMutableProject()

    expect(() =>
      cli({ name: "pm", commands: [editCommand] }, undefined, [
        "edit",
        "1",
        "--set",
        "no-colon",
      ]),
    ).toThrow("Invalid --set format")
  })

  it("aborts on invalid document ID", () => {
    setupMutableProject()

    expect(() =>
      cli({ name: "pm", commands: [editCommand] }, undefined, [
        "edit",
        "abc",
        "--set",
        "status:done",
      ]),
    ).toThrow("Invalid document ID")
  })

  it("aborts on unknown document ID", () => {
    setupMutableProject()

    expect(() =>
      cli({ name: "pm", commands: [editCommand] }, undefined, [
        "edit",
        "999",
        "--set",
        "status:done",
      ]),
    ).toThrow("Document 999 not found")
  })

  it("aborts on invalid parent ID", () => {
    setupMutableProject()

    expect(() =>
      cli({ name: "pm", commands: [editCommand] }, undefined, [
        "edit",
        "1",
        "--parent",
        "xyz",
      ]),
    ).toThrow("Invalid parent ID")
  })

  it("aborts when --parent conflicts with --set parent", () => {
    setupMutableProject()

    expect(() =>
      cli({ name: "pm", commands: [editCommand] }, undefined, [
        "edit",
        "4",
        "--parent",
        "2",
        "--set",
        "parent:2",
      ]),
    ).toThrow("Cannot combine --parent with --set parent")
  })

  it("sets parent to a document", () => {
    const dir = setupMutableProject()

    cli({ name: "pm", commands: [editCommand] }, undefined, [
      "edit",
      "4",
      "--parent",
      "1",
    ])

    const data = readDoc(dir, "docs/004.task.session-store.md")
    expect(data.parent).toBe("001.feat.user-auth")
  })

  it("sets parent to a group", () => {
    const dir = setupMutableProject()

    cli({ name: "pm", commands: [editCommand] }, undefined, [
      "edit",
      "1",
      "--parent",
      "10",
    ])

    const data = readDoc(dir, "docs/001.feat.user-auth.md")
    expect(data.parent).toBe("010.backlog")
  })

  it("changes the type by name and renames the file", () => {
    const dir = setupMutableProject()

    cli({ name: "pm", commands: [editCommand] }, undefined, [
      "edit",
      "3",
      "--type",
      "feature",
    ])

    const data = readDoc(dir, "docs/003.feat.jwt-middleware.md")
    expect(data.title).toBe("Add JWT middleware")
    expect(cliMod.info).toHaveBeenCalledWith(expect.stringContaining("Renamed"))
  })

  it("changes the type by tag and renames the file", () => {
    const dir = setupMutableProject()

    cli({ name: "pm", commands: [editCommand] }, undefined, [
      "edit",
      "4",
      "--type",
      "feat",
    ])

    const data = readDoc(dir, "docs/004.feat.session-store.md")
    expect(data.title).toBe("Session store")
    expect(cliMod.info).toHaveBeenCalledWith(expect.stringContaining("Renamed"))
  })

  it("aborts on unknown --type", () => {
    setupMutableProject()

    expect(() =>
      cli({ name: "pm", commands: [editCommand] }, undefined, [
        "edit",
        "1",
        "--type",
        "bogus",
      ]),
    ).toThrow('Unknown type "bogus"')
  })

  it("combines --type with --update-slug", () => {
    const dir = setupMutableProject()

    cli({ name: "pm", commands: [editCommand] }, undefined, [
      "edit",
      "2",
      "--type",
      "task",
      "--set",
      "title:Login flow v2",
      "--update-slug",
    ])

    const data = readDoc(dir, "docs/002.task.login-flow-v2.md")
    expect(data.title).toBe("Login flow v2")
    expect(cliMod.info).toHaveBeenCalledWith(expect.stringContaining("Renamed"))
  })

  it("sets blocked_by with --blocked-by and --set status:blocked", () => {
    const dir = setupMutableProject()

    cli({ name: "pm", commands: [editCommand] }, undefined, [
      "edit",
      "4",
      "--blocked-by",
      "3",
      "--set",
      "status:blocked",
    ])

    const data = readDoc(dir, "docs/004.task.session-store.md")
    expect(data.status).toBe("blocked")
    expect(data.blocked_by).toBe("003.task.jwt-middleware")
  })

  it("sets blocked_by to a group", () => {
    const dir = setupMutableProject()

    cli({ name: "pm", commands: [editCommand] }, undefined, [
      "edit",
      "4",
      "--blocked-by",
      "10",
      "--set",
      "status:blocked",
    ])

    const data = readDoc(dir, "docs/004.task.session-store.md")
    expect(data.status).toBe("blocked")
    expect(data.blocked_by).toBe("010.backlog")
  })

  it("aborts when --blocked-by is given without --set status", () => {
    setupMutableProject()

    expect(() =>
      cli({ name: "pm", commands: [editCommand] }, undefined, [
        "edit",
        "4",
        "--blocked-by",
        "3",
      ]),
    ).toThrow("--blocked-by requires --set status")
  })

  it("aborts when --blocked-by status is not a blocked status for the type", () => {
    setupMutableProject()

    expect(() =>
      cli({ name: "pm", commands: [editCommand] }, undefined, [
        "edit",
        "5",
        "--blocked-by",
        "3",
        "--set",
        "status:in-progress",
      ]),
    ).toThrow(
      'Status "in-progress" is not a blocked status for type "bug". Blocked statuses: stuck',
    )
  })

  it("aborts when --blocked-by conflicts with --set blocked_by", () => {
    setupMutableProject()

    expect(() =>
      cli({ name: "pm", commands: [editCommand] }, undefined, [
        "edit",
        "4",
        "--blocked-by",
        "3",
        "--set",
        "blocked_by:3",
        "--set",
        "status:blocked",
      ]),
    ).toThrow("Cannot combine --blocked-by with --set blocked_by:3")
  })

  it("aborts when --blocked-by references non-existent document", () => {
    setupMutableProject()

    expect(() =>
      cli({ name: "pm", commands: [editCommand] }, undefined, [
        "edit",
        "4",
        "--blocked-by",
        "999",
        "--set",
        "status:blocked",
      ]),
    ).toThrow("Blocking node 999 not found")
  })

  it("renames file with --update-slug when title changes", () => {
    const dir = setupMutableProject()

    cli({ name: "pm", commands: [editCommand] }, undefined, [
      "edit",
      "2",
      "--set",
      "title:New login flow",
      "--update-slug",
    ])

    const data = readDoc(dir, "docs/002.spec.new-login-flow.md")
    expect(data.title).toBe("New login flow")
    expect(cliMod.success).toHaveBeenCalledWith(
      expect.stringContaining("Updated"),
    )
    expect(cliMod.info).toHaveBeenCalledWith(expect.stringContaining("Renamed"))
  })

  it("aborts on empty title via --set title:", () => {
    setupMutableProject()

    expect(() =>
      cli({ name: "pm", commands: [editCommand] }, undefined, [
        "edit",
        "1",
        "--set",
        "title:",
      ]),
    ).toThrow("Title must not be empty")
  })

  it("aborts on blank title via --set title:   ", () => {
    setupMutableProject()

    expect(() =>
      cli({ name: "pm", commands: [editCommand] }, undefined, [
        "edit",
        "1",
        "--set",
        "title:   ",
      ]),
    ).toThrow("Title must not be empty")
  })
})
