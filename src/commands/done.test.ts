import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
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
import { doneCommand } from "./done.js"

const FIXTURE_DIR = join(
  import.meta.dirname,
  "../../test/fixtures/basic-project",
)
const workspace = createTestWorkspace("done-cmd")

describe("done command", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("marks a document as done", () => {
    vi.clearAllMocks()
    const dir = workspace.copyFixture(FIXTURE_DIR)
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(
      resolveProject(
        { doctypes: { feature: { tag: "feat", dir: "context/features", intermediateDir: true }, spec: { tag: "spec", dir: ".", parent: "feature" }, task: { tag: "task", dir: ".", parent: "spec" } } },
        join(dir, ".pm.json"),
      ),
    )

    // Doc 4 (session-store) has status "new"
    cli({ name: "pm", commands: [doneCommand] }, undefined, ["done", "4"])

    // Verify the file was updated
    const content = readFileSync(
      join(
        dir,
        "context/features/001.feat.user-auth/004.task.session-store.md",
      ),
      "utf-8",
    )
    const { data } = parseFrontmatter(content)
    expect(data.status).toBe("done")

    // Verify success output
    expect(cliMod.success).toHaveBeenCalledWith(expect.stringContaining("done"))
  })

  it("aborts on non-existent document", () => {
    vi.clearAllMocks()
    const dir = workspace.copyFixture(FIXTURE_DIR)
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(
      resolveProject(
        { doctypes: { feature: { tag: "feat", dir: "context/features", intermediateDir: true }, spec: { tag: "spec", dir: ".", parent: "feature" }, task: { tag: "task", dir: ".", parent: "spec" } } },
        join(dir, ".pm.json"),
      ),
    )

    expect(() =>
      cli({ name: "pm", commands: [doneCommand] }, undefined, ["done", "999"]),
    ).toThrow()
  })

  it("aborts on invalid ID", () => {
    vi.clearAllMocks()
    vi.spyOn(process, "cwd").mockReturnValue(FIXTURE_DIR)
    vi.mocked(loadProjectFrom).mockReturnValue(
      resolveProject(
        { doctypes: { feature: { tag: "feat", dir: "context/features", intermediateDir: true }, spec: { tag: "spec", dir: ".", parent: "feature" }, task: { tag: "task", dir: ".", parent: "spec" } } },
        join(FIXTURE_DIR, ".pm.json"),
      ),
    )

    expect(() =>
      cli({ name: "pm", commands: [doneCommand] }, undefined, ["done", "abc"]),
    ).toThrow("Invalid document ID")
  })
})
