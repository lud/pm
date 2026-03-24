import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { join } from "node:path"
import { readFileSync, writeFileSync } from "node:fs"
import { cli } from "cleye"
import { resolveProject } from "../lib/project.js"
import { prependFrontmatter, parseFrontmatter } from "../lib/frontmatter.js"
import { createTestWorkspace } from "../lib/test-workspace.js"

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
import { listCommand } from "./list.js"

const FIXTURE_DIR = join(
  import.meta.dirname,
  "../../test/fixtures/basic-project",
)
const workspace = createTestWorkspace("list-cmd")

function infoLines(): string[] {
  return vi.mocked(cliMod.info).mock.calls.map(([msg]) => msg)
}

describe("list command", () => {
  let dir: string

  beforeEach(() => {
    dir = workspace.copyFixture(FIXTURE_DIR)
    vi.clearAllMocks()
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(
      resolveProject(
        { doctypes: { feature: { tag: "feat", dir: "context/features", intermediateDir: true }, spec: { tag: "spec", dir: ".", parent: "feature" }, task: { tag: "task", dir: ".", parent: "spec" } } },
        join(dir, ".pm.json"),
      ),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("lists active documents by default", () => {
    cli({ name: "pm", commands: [listCommand] }, undefined, ["list"])
    const lines = infoLines()
    // Doc 3 (jwt-middleware) is done, so should not appear
    expect(lines.some((l) => l.includes("User authentication"))).toBe(true)
    expect(lines.some((l) => l.includes("Login flow"))).toBe(true)
    expect(lines.some((l) => l.includes("Session store"))).toBe(true)
    expect(lines.some((l) => l.includes("Add JWT middleware"))).toBe(false)
  })

  it("lists done documents with --done", () => {
    cli({ name: "pm", commands: [listCommand] }, undefined, ["list", "--done"])
    const lines = infoLines()
    // Only doc 3 is done
    expect(lines.some((l) => l.includes("Add JWT middleware"))).toBe(true)
    expect(lines.some((l) => l.includes("Session store"))).toBe(false)
  })

  it("filters by doctype with --type", () => {
    cli({ name: "pm", commands: [listCommand] }, undefined, [
      "list",
      "--type",
      "task",
    ])
    const lines = infoLines()
    // Only active tasks
    expect(lines.some((l) => l.includes("Session store"))).toBe(true)
    expect(lines.some((l) => l.includes("User authentication"))).toBe(false)
    expect(lines.some((l) => l.includes("Login flow"))).toBe(false)
  })

  it("filters by parent with --parent", () => {
    cli({ name: "pm", commands: [listCommand] }, undefined, [
      "list",
      "--parent",
      "2",
    ])
    const lines = infoLines()
    // Descendants of spec 002: tasks 003 and 004 (only active)
    expect(lines.some((l) => l.includes("Session store"))).toBe(true)
    expect(lines.some((l) => l.includes("User authentication"))).toBe(false)
  })

  it("filters by exact status with --status", () => {
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

  it("aborts on unknown doctype", () => {
    expect(() =>
      cli({ name: "pm", commands: [listCommand] }, undefined, [
        "list",
        "--type",
        "nonexistent",
      ]),
    ).toThrow('Unknown doctype: "nonexistent"')
  })

  it("aborts on invalid parent ID", () => {
    expect(() =>
      cli({ name: "pm", commands: [listCommand] }, undefined, [
        "list",
        "--parent",
        "abc",
      ]),
    ).toThrow("Invalid parent ID")
  })

  it("filters by typed frontmatter with --is", () => {
    const filePath = join(
      dir,
      "context/features/001.feat.user-auth/004.task.session-store.md",
    )
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
      "--active",
      "--done",
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
