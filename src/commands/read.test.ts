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
import { readCommand } from "./read.js"

const FIXTURE_DIR = join(
  import.meta.dirname,
  "../../test/fixtures/basic-project",
)

describe("read command", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(process, "cwd").mockReturnValue(FIXTURE_DIR)
    vi.mocked(loadProjectFrom).mockReturnValue(
      resolveProject(
        { doctypes: { feature: { tag: "feat", dir: "context/features", intermediateDir: true }, spec: { tag: "spec", dir: ".", parent: "feature" }, task: { tag: "task", dir: ".", parent: "spec" } } },
        join(FIXTURE_DIR, ".pm.json"),
      ),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("outputs raw file content", () => {
    cli({ name: "pm", commands: [readCommand] }, undefined, ["read", "1"])
    expect(cliMod.write).toHaveBeenCalledWith(
      expect.stringContaining("title: User authentication"),
    )
    expect(cliMod.write).toHaveBeenCalledWith(
      expect.stringContaining("Feature for user authentication."),
    )
  })

  it("includes frontmatter in output", () => {
    cli({ name: "pm", commands: [readCommand] }, undefined, ["read", "1"])
    const content = vi.mocked(cliMod.write).mock.calls[0][0]
    expect(content).toMatch(/^---\n/)
  })

  it("aborts on non-existent document", () => {
    expect(() =>
      cli({ name: "pm", commands: [readCommand] }, undefined, ["read", "999"]),
    ).toThrow("Document 999 not found")
  })

  it("aborts on invalid ID", () => {
    expect(() =>
      cli({ name: "pm", commands: [readCommand] }, undefined, ["read", "xyz"]),
    ).toThrow("Invalid document ID")
  })
})
