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
import { editCommand } from "./edit.js"

const testProject = createTestProject("edit-cmd")

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

function setupMutableProject() {
  const { dir, project } = testProject.setup(BASIC_SETUP)
  vi.spyOn(process, "cwd").mockReturnValue(dir)
  vi.mocked(loadProjectFrom).mockReturnValue(project)
  return dir
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

    const content = readFileSync(
      join(dir, "context/features/001.feat.user-auth/001.feat.user-auth.md"),
      "utf-8",
    )
    const { data } = parseFrontmatter(content)
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

    const content = readFileSync(
      join(dir, "context/features/001.feat.user-auth/001.feat.user-auth.md"),
      "utf-8",
    )
    const { data } = parseFrontmatter(content)
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

    const content = readFileSync(
      join(dir, "context/features/001.feat.user-auth/001.feat.user-auth.md"),
      "utf-8",
    )
    const { data } = parseFrontmatter(content)
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

    const content = readFileSync(
      join(
        dir,
        "context/features/001.feat.user-auth/004.task.session-store.md",
      ),
      "utf-8",
    )
    const { data } = parseFrontmatter(content)
    expect(data.status).toBe("blocked")
    expect(data.blocked_by).toBe("3.task.jwt-middleware")
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

  it("aborts when --blocked-by status is not a blocked status", () => {
    setupMutableProject()

    expect(() =>
      cli({ name: "pm", commands: [editCommand] }, undefined, [
        "edit",
        "4",
        "--blocked-by",
        "3",
        "--set",
        "status:in-progress",
      ]),
    ).toThrow(/not a blocked status/)
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
    ).toThrow("Blocking document 999 not found")
  })
})
