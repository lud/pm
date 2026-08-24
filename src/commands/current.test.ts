import { existsSync, readFileSync } from "node:fs"
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
import { currentCommand } from "./current.js"

const testProject = createTestProject("current-cmd")

const PM_JSON = {
  directory: "docs",
  types: {
    feature: { tag: "feat" },
    task: { tag: "task" },
  },
}

const BASIC_FILES = {
  "docs/010.stuff/002.feat.auth.md": {
    parent: "010.stuff",
    title: "Auth",
    status: "new",
  },
  "docs/010.stuff/003.task.login.md": {
    parent: "002.feat.auth",
    title: "Login",
    status: "new",
  },
}

let dir: string

function setup(config: Parameters<typeof testProject.setup>[0]) {
  const result = testProject.setup(config)
  dir = result.dir
  vi.spyOn(process, "cwd").mockReturnValue(dir)
  vi.mocked(loadProjectFrom).mockReturnValue(result.project)
  return result
}

function run(...args: string[]) {
  cli({ name: "pm", commands: [currentCommand] }, undefined, [
    "current",
    ...args,
  ])
}

function allInfoOutput(): string {
  return vi
    .mocked(cliMod.info)
    .mock.calls.map((c) => c[0])
    .join("\n")
}

describe("current command", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("reports no current document when unset", () => {
    setup({ pmJson: PM_JSON, files: BASIC_FILES })
    run()
    expect(allInfoOutput()).toMatch(/No current document set/)
  })

  it("sets and displays the current document", () => {
    setup({ pmJson: PM_JSON, files: BASIC_FILES })
    run("2")
    expect(readFileSync(join(dir, ".pm.current"), "utf-8").trim()).toBe("2")
    const output = allInfoOutput()
    expect(output).toMatch(/002 feature Auth \(new\)/)
    expect(output).toMatch(/Children:/)
  })

  it("shows a previously set current document", () => {
    setup({ pmJson: PM_JSON, pmCurrent: 3, files: BASIC_FILES })
    run()
    expect(allInfoOutput()).toMatch(/003 task Login \(new\)/)
  })

  it("accepts a group as the current node", () => {
    setup({ pmJson: PM_JSON, pmCurrent: 10, files: BASIC_FILES })
    run()
    const output = allInfoOutput()
    expect(output).toMatch(/010 group stuff/)
  })

  it("aborts on invalid ID", () => {
    setup({ pmJson: PM_JSON, files: BASIC_FILES })
    expect(() => run("nope")).toThrow(/Invalid document ID: "nope"/)
  })

  it("warns and clears when the current node does not exist", () => {
    setup({ pmJson: PM_JSON, pmCurrent: 99, files: BASIC_FILES })
    run()
    expect(cliMod.warning).toHaveBeenCalledWith(
      "Current document 99 not found. Clearing.",
    )
    expect(existsSync(join(dir, ".pm.current"))).toBe(false)
  })
})
