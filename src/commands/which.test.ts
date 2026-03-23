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
import { whichCommand } from "./which.js"

const FIXTURE_DIR = join(
  import.meta.dirname,
  "../../test/fixtures/basic-project",
)

describe("which command", () => {
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

  it("outputs the .pm.json path relative to cwd", () => {
    cli({ name: "pm", commands: [whichCommand] }, undefined, ["which"])
    expect(cliMod.info).toHaveBeenCalledWith(".pm.json")
  })

  it("outputs absolute path when cwd is elsewhere", () => {
    vi.spyOn(process, "cwd").mockReturnValue("/tmp")
    cli({ name: "pm", commands: [whichCommand] }, undefined, ["which"])
    expect(cliMod.info).toHaveBeenCalledWith(join(FIXTURE_DIR, ".pm.json"))
  })
})
