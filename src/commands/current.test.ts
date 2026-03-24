import { describe, it, expect, vi, afterEach } from "vitest"
import { join } from "node:path"
import { cli } from "cleye"
import { resolveProject } from "../lib/project.js"
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
import { currentCommand } from "./current.js"

const FIXTURE_DIR = join(
  import.meta.dirname,
  "../../test/fixtures/basic-project",
)
const workspace = createTestWorkspace("current-cmd")

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

describe("current command", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it("reports no current document when unset", () => {
    setupMutableProject()

    cli({ name: "pm", commands: [currentCommand] }, undefined, ["current"])
    expect(cliMod.info).toHaveBeenCalledWith(
      expect.stringContaining("No current document"),
    )
  })

  it("sets and displays current document", () => {
    setupMutableProject()

    // Set current to doc 1
    cli({ name: "pm", commands: [currentCommand] }, undefined, ["current", "1"])

    expect(cliMod.info).toHaveBeenCalledWith("doctype: feature")
    expect(cliMod.info).toHaveBeenCalledWith("id: 1")
  })

  it("shows previously set current document", () => {
    setupMutableProject()

    // Set current
    cli({ name: "pm", commands: [currentCommand] }, undefined, ["current", "2"])
    vi.clearAllMocks()

    // Read current
    cli({ name: "pm", commands: [currentCommand] }, undefined, ["current"])
    expect(cliMod.info).toHaveBeenCalledWith("id: 2")
  })

  it("aborts on invalid ID", () => {
    setupMutableProject()

    expect(() =>
      cli({ name: "pm", commands: [currentCommand] }, undefined, [
        "current",
        "abc",
      ]),
    ).toThrow("Invalid document ID")
  })

  it("warns and clears when current document does not exist", () => {
    const dir = setupMutableProject()

    // Write .pm.current directly with a non-existent ID
    const { writeFileSync } = require("node:fs")
    writeFileSync(join(dir, ".pm.current"), "999\n")

    // Read current — should warn and clear
    cli({ name: "pm", commands: [currentCommand] }, undefined, ["current"])
    expect(cliMod.warning).toHaveBeenCalledWith(
      expect.stringContaining("not found"),
    )
  })
})
