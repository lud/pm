import { describe, it, expect, vi, afterEach } from "vitest"
import { join } from "node:path"
import { readFileSync } from "node:fs"
import { cli } from "cleye"
import { resolveProject } from "../lib/project.js"
import { createTestWorkspace } from "../lib/test-workspace.js"
import { parseFrontmatter } from "../lib/frontmatter.js"

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

const FIXTURE_DIR = join(
  import.meta.dirname,
  "../../test/fixtures/basic-project",
)
const workspace = createTestWorkspace("edit-cmd")

function setupMutableProject() {
  const dir = workspace.copyFixture(FIXTURE_DIR)
  vi.spyOn(process, "cwd").mockReturnValue(dir)
  vi.mocked(loadProjectFrom).mockReturnValue(
    resolveProject(
      { doctypes: { feature: { dir: "context/features" } } },
      join(dir, ".pm.json"),
    ),
  )
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
})
