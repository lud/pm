import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { join } from "node:path"
import { cli } from "cleye"
import { resolveProject } from "../lib/project.js"

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

function infoLines(): string[] {
  return vi.mocked(cliMod.info).mock.calls.map(([msg]) => msg)
}

describe("list command", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(process, "cwd").mockReturnValue(FIXTURE_DIR)
    vi.mocked(loadProjectFrom).mockReturnValue(
      resolveProject(
        { doctypes: { feature: { dir: "context/features" } } },
        join(FIXTURE_DIR, ".pm.json"),
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
})
