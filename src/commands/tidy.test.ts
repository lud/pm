import { existsSync } from "node:fs"
import { join } from "node:path"
import { cli } from "cleye"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestProject } from "../lib/test-setup.js"

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

vi.mock("../core/config.js", async () => {
  const actual = (await vi.importActual("../core/config.js")) as Record<
    string,
    unknown
  >
  return { ...actual, loadProjectFrom: vi.fn() }
})

import { loadProjectFrom } from "../core/config.js"
import * as cliMod from "../lib/cli.js"
import { tidyCommand } from "./tidy.js"

const testProject = createTestProject("tidy-cmd")

const PM_JSON = {
  directory: "docs",
  types: { feature: { tag: "feat" }, task: { tag: "task" } },
}

let dir: string

function setup(config: Parameters<typeof testProject.setup>[0]) {
  const result = testProject.setup(config)
  dir = result.dir
  vi.spyOn(process, "cwd").mockReturnValue(dir)
  vi.mocked(loadProjectFrom).mockReturnValue(result.project)
  return result
}

async function run(...args: string[]) {
  await cli({ name: "pm", commands: [tidyCommand] }, undefined, [
    "tidy",
    ...args,
  ])
  // cleye runs async handlers without awaiting; give the handler a tick
  await new Promise((resolve) => setTimeout(resolve, 50))
}

function allInfoOutput(): string {
  return vi
    .mocked(cliMod.info)
    .mock.calls.map((c) => c[0])
    .join("\n")
}

describe("tidy command", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("reports a clean project", async () => {
    setup({
      pmJson: PM_JSON,
      files: { "docs/001.task.a.md": { title: "A", status: "new" } },
    })
    await run()
    expect(cliMod.success).toHaveBeenCalledWith("Everything is tidy.")
  })

  it("dry-run displays the plan without touching disk", async () => {
    setup({
      pmJson: PM_JSON,
      files: {
        "docs/001.feat.core/001.feat.core.md": { title: "Core", status: "new" },
      },
    })
    await run()
    const output = allInfoOutput()
    expect(output).toMatch(/ID changes:/)
    expect(output).toMatch(/1 → 2 \(group core\)/)
    expect(output).toMatch(/Directory renames:/)
    expect(output).toMatch(/001\.feat\.core → .*002\.core/)
    expect(output).toMatch(/Frontmatter updates:/)
    expect(output).toMatch(/→ parent: 002\.core/)
    expect(output).toMatch(/Dry run\. Use -f to apply changes\./)
    // nothing applied
    expect(existsSync(join(dir, "docs/001.feat.core/001.feat.core.md"))).toBe(
      true,
    )
  })

  it("applies the plan with --force", async () => {
    setup({
      pmJson: PM_JSON,
      files: {
        "docs/001.feat.core/001.feat.core.md": { title: "Core", status: "new" },
        "docs/002.task.stray.md": {
          parent: "1.feat.core",
          title: "Stray",
          status: "new",
        },
      },
    })
    await run("--force")
    expect(cliMod.success).toHaveBeenCalledWith("Tidy complete.")
    expect(existsSync(join(dir, "docs/003.core/001.feat.core.md"))).toBe(true)
    expect(existsSync(join(dir, "docs/003.core/002.task.stray.md"))).toBe(true)
    expect(existsSync(join(dir, "docs/001.feat.core"))).toBe(false)
  })

  it("--force --no-interactive applies without prompting, warning on ambiguities", async () => {
    setup({
      pmJson: PM_JSON,
      files: {
        "docs/001.feat.alpha.md": { title: "Alpha", status: "new" },
        "docs/001.feat.beta.md": { title: "Beta", status: "new" },
        "docs/002.feat.child.md": { parent: 1, title: "C", status: "new" },
      },
    })
    await run("--force", "--no-interactive")
    expect(cliMod.success).toHaveBeenCalledWith("Tidy complete.")
    const warnings = vi
      .mocked(cliMod.warning)
      .mock.calls.map((c) => c[0])
      .join("\n")
    expect(warnings).toMatch(/ambiguous parent ref/)
    // the duplicate was still renumbered; only the ambiguous ref was left
    expect(existsSync(join(dir, "docs/003.feat.beta.md"))).toBe(true)
  })

  it("prints config and plan warnings on a dry run instead of prompting", async () => {
    setup({
      pmJson: {
        directory: "docs",
        doctypes: { feature: { tag: "feat", dir: "." } },
      },
      files: {
        "docs/001.feat.alpha.md": { title: "Alpha", status: "new" },
        "docs/001.feat.beta.md": { title: "Beta", status: "new" },
        "docs/002.feat.child.md": { parent: 1, title: "C", status: "new" },
      },
    })
    await run()
    const warnings = vi
      .mocked(cliMod.warning)
      .mock.calls.map((c) => c[0])
      .join("\n")
    expect(warnings).toMatch(/Legacy "doctypes"/)
    expect(warnings).toMatch(/ambiguous parent ref/)
  })
})
