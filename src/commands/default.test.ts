import { describe, it, expect, vi, afterEach } from "vitest"
import { join } from "node:path"
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
  return {
    ...actual,
    tryLocateProjectFile: vi.fn(),
    loadProjectFile: vi.fn(),
  }
})

import * as cliMod from "../lib/cli.js"
import { tryLocateProjectFile, loadProjectFile } from "../lib/project.js"
import { runDefaultCommand } from "./default.js"

const FIXTURE_DIR = join(
  import.meta.dirname,
  "../../test/fixtures/basic-project",
)

describe("default command", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it("suggests pm init when no project found", () => {
    vi.spyOn(process, "cwd").mockReturnValue("/tmp")
    vi.mocked(tryLocateProjectFile).mockReturnValue(null)

    runDefaultCommand()

    expect(cliMod.info).toHaveBeenCalledWith(expect.stringContaining("pm init"))
  })

  it("shows status summary when project exists", () => {
    vi.spyOn(process, "cwd").mockReturnValue(FIXTURE_DIR)
    const pmJson = join(FIXTURE_DIR, ".pm.json")
    vi.mocked(tryLocateProjectFile).mockReturnValue(pmJson)
    vi.mocked(loadProjectFile).mockReturnValue(
      resolveProject(
        { doctypes: { feature: { dir: "context/features" } } },
        pmJson,
      ),
    )

    runDefaultCommand()

    const calls = vi.mocked(cliMod.info).mock.calls.map(([msg]) => msg)
    const output = calls.join("\n")
    expect(output).toContain("active")
    expect(output).toContain("done")
  })
})
