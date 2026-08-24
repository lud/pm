import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { cli } from "cleye"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { resolveConfig } from "../core/config.js"
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

import * as cliMod from "../lib/cli.js"
import { initCommand } from "./init.js"

const workspace = createTestWorkspace("init-cmd")

async function run(cwd: string, ...args: string[]) {
  vi.spyOn(process, "cwd").mockReturnValue(cwd)
  await cli({ name: "pm", commands: [initCommand] }, undefined, [
    "init",
    ...args,
  ])
  await new Promise((resolve) => setTimeout(resolve, 50))
}

describe("init command (non-interactive)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("writes a clean v2 config, creates the directory and .gitignore", async () => {
    const dir = workspace.dir("fresh")
    await run(dir, "--directory", "context/pm")

    const configPath = join(dir, "pm.json")
    expect(existsSync(configPath)).toBe(true)
    const raw = JSON.parse(readFileSync(configPath, "utf-8"))
    expect(raw.directory).toBe("context/pm")
    expect(Object.keys(raw.types)).toEqual([
      "feature",
      "spec",
      "task",
      "adr",
      "note",
    ])
    expect(raw.types.adr.defaultStatus).toBe("proposed")
    expect(raw.types.adr.doneStatuses).toEqual([
      "accepted",
      "rejected",
      "superseded",
    ])
    expect(raw.types.note.doneStatuses).toEqual(["archived"])

    // the config init writes must produce zero loader warnings
    const project = resolveConfig(raw, configPath)
    expect(project.warnings).toEqual([])
    expect(project.rootDir).toBe(join(dir, "context/pm"))

    expect(existsSync(join(dir, "context/pm"))).toBe(true)
    expect(readFileSync(join(dir, ".gitignore"), "utf-8")).toContain(
      ".pm.current",
    )
    expect(cliMod.success).toHaveBeenCalledWith("Project initialized")
  })

  it("appends to an existing .gitignore without duplicating", async () => {
    const dir = workspace.dir("gitignore")
    writeFileSync(join(dir, ".gitignore"), "node_modules\n.pm.current\n")
    await run(dir, "--directory", "docs")
    expect(readFileSync(join(dir, ".gitignore"), "utf-8")).toBe(
      "node_modules\n.pm.current\n",
    )
  })

  it("aborts when pm.json already exists", async () => {
    const dir = workspace.dir("existing")
    writeFileSync(join(dir, "pm.json"), "{}")
    await expect(run(dir, "--directory", "docs")).rejects.toThrow(
      /Already a pm project/,
    )
  })

  it("warns but proceeds for a nested project", async () => {
    const parent = workspace.dir("nested")
    writeFileSync(join(parent, "pm.json"), JSON.stringify({ directory: "x" }))
    const child = join(parent, "sub")
    mkdirSync(child)
    await run(child, "--directory", "docs")
    expect(cliMod.warning).toHaveBeenCalledWith(
      expect.stringMatching(/nested project/),
    )
    expect(existsSync(join(child, "pm.json"))).toBe(true)
  })

  it("rejects an empty --directory", async () => {
    const dir = workspace.dir("empty-dir")
    await expect(run(dir, "--directory", "  ")).rejects.toThrow(
      /--directory must not be empty/,
    )
    expect(existsSync(join(dir, "pm.json"))).toBe(false)
  })
})
