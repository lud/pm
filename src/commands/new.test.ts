import { describe, it, expect, vi, afterEach } from "vitest"
import { join } from "node:path"
import { existsSync, readFileSync } from "node:fs"
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

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}))

import * as cliMod from "../lib/cli.js"
import { loadProjectFrom } from "../lib/project.js"
import { newCommand } from "./new.js"

const FIXTURE_DIR = join(
  import.meta.dirname,
  "../../test/fixtures/basic-project",
)
const workspace = createTestWorkspace("new-cmd")

function setupMutableProject() {
  const dir = workspace.copyFixture(FIXTURE_DIR)
  vi.spyOn(process, "cwd").mockReturnValue(dir)
  vi.mocked(loadProjectFrom).mockReturnValue(
    resolveProject(
      { doctypes: { feature: { tag: "feat", dir: "context/features", intermediateDir: true }, spec: { tag: "spec", dir: ".", parent: "feature" }, task: { tag: "task", dir: ".", parent: "spec" } } },
      join(dir, ".pm.json"),
    ),
  )
  return dir
}

describe("new command", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it("creates a new feature document", () => {
    const dir = setupMutableProject()

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
    const expectedPath = join(
      dir,
      "context/features/005.feat.payment-processing",
    )
    expect(existsSync(expectedPath)).toBe(true)
  })

  it("creates a spec with parent", () => {
    const dir = setupMutableProject()

    cli({ name: "pm", commands: [newCommand] }, undefined, [
      "new",
      "spec",
      "OAuth",
      "flow",
      "--parent",
      "1",
    ])

    expect(cliMod.success).toHaveBeenCalledWith(
      expect.stringContaining("Created"),
    )
  })

  it("creates with custom status", () => {
    const dir = setupMutableProject()

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
  })

  it("aborts on unknown doctype", () => {
    setupMutableProject()

    expect(() =>
      cli({ name: "pm", commands: [newCommand] }, undefined, [
        "new",
        "nonexistent",
        "Title",
      ]),
    ).toThrow()
  })

  it("aborts on invalid parent ID", () => {
    setupMutableProject()

    expect(() =>
      cli({ name: "pm", commands: [newCommand] }, undefined, [
        "new",
        "spec",
        "Title",
        "--parent",
        "abc",
      ]),
    ).toThrow()
  })

  it("sets typed frontmatter properties via --set", () => {
    const dir = setupMutableProject()

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

    const createdPath = join(
      dir,
      "context/features/005.feat.typed-props/005.feat.typed-props.md",
    )
    const content = readFileSync(createdPath, "utf-8")
    const { data } = parseFrontmatter(content)

    expect(data.priority).toBe(2)
    expect(data.blocked).toBe(true)
    expect(data.label).toBe("high")
  })

  it("aborts when --set targets reserved new fields", () => {
    setupMutableProject()

    expect(() =>
      cli({ name: "pm", commands: [newCommand] }, undefined, [
        "new",
        "feature",
        "Title",
        "--set",
        "status:done",
      ]),
    ).toThrow('Cannot use --set status:... with "new"')
  })

  it("aborts on malformed --set assignment", () => {
    setupMutableProject()

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

  it("warns when --editor is set but no editor configured", () => {
    setupMutableProject()
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
