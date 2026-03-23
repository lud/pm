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
import { statusCommand } from "./status.js"

const MULTI_STATUS_DIR = join(
  import.meta.dirname,
  "../../test/fixtures/multi-status",
)
const BASIC_DIR = join(import.meta.dirname, "../../test/fixtures/basic-project")

function infoLines(): string[] {
  return vi.mocked(cliMod.info).mock.calls.map(([msg]) => msg)
}

describe("status command", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("shows status summary for basic project", () => {
    vi.clearAllMocks()
    vi.spyOn(process, "cwd").mockReturnValue(BASIC_DIR)
    vi.mocked(loadProjectFrom).mockReturnValue(
      resolveProject(
        { doctypes: { feature: { dir: "context/features" } } },
        join(BASIC_DIR, ".pm.json"),
      ),
    )

    cli({ name: "pm", commands: [statusCommand] }, undefined, ["status"])
    const lines = infoLines()
    const output = lines.join("\n")
    expect(output).toContain("active")
    expect(output).toContain("done")
  })

  it("shows status breakdown for multi-status project", () => {
    vi.clearAllMocks()
    vi.spyOn(process, "cwd").mockReturnValue(MULTI_STATUS_DIR)
    vi.mocked(loadProjectFrom).mockReturnValue(
      resolveProject(
        { doctypes: { feature: { dir: "context/features" } } },
        join(MULTI_STATUS_DIR, ".pm.json"),
      ),
    )

    cli({ name: "pm", commands: [statusCommand] }, undefined, ["status"])
    const lines = infoLines()
    const output = lines.join("\n")
    // multi-status fixture has multiple status values
    expect(output).toContain("feature:")
  })
})
