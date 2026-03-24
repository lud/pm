import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { createTestWorkspace } from "./test-workspace.js"

// Mock cli.ts to prevent process.exit
vi.mock("./cli.js", () => ({
  abortError: vi.fn((msg: string) => {
    throw new Error(msg)
  }),
  error: vi.fn(),
}))

import {
  mkdirSyncOrAbort,
  readdirSyncOrAbort,
  readFileSyncOrAbort,
  writeFileSyncOrAbort,
} from "./fs-helpers.js"

const workspace = createTestWorkspace("fs-helpers")

describe("mkdirSyncOrAbort", () => {
  it("creates a directory", () => {
    const dir = workspace.dir("mkdir-parent")
    const target = join(dir, "subdir")
    mkdirSyncOrAbort(target)
    expect(() => readdirSyncOrAbort(target)).not.toThrow()
  })

  it("aborts with message on failure", () => {
    // Try to create inside a non-existent parent without recursive
    expect(() => mkdirSyncOrAbort("/nonexistent/path/dir")).toThrow(
      /create directory/,
    )
  })
})

describe("readdirSyncOrAbort", () => {
  it("reads directory contents", () => {
    const dir = workspace.dir("readdir-test")
    const { writeFileSync } = require("node:fs")
    writeFileSync(join(dir, "a.txt"), "a")
    writeFileSync(join(dir, "b.txt"), "b")
    const entries = readdirSyncOrAbort(dir)
    expect(entries).toContain("a.txt")
    expect(entries).toContain("b.txt")
  })

  it("aborts on non-existent directory", () => {
    expect(() => readdirSyncOrAbort("/nonexistent/dir")).toThrow(
      /read directory.*not found/,
    )
  })
})

describe("readFileSyncOrAbort", () => {
  it("reads file contents", () => {
    const dir = workspace.dir("readfile-test")
    const filePath = join(dir, "test.txt")
    const { writeFileSync } = require("node:fs")
    writeFileSync(filePath, "hello")
    expect(readFileSyncOrAbort(filePath, "utf-8")).toBe("hello")
  })

  it("aborts on non-existent file", () => {
    expect(() => readFileSyncOrAbort("/nonexistent/file.txt", "utf-8")).toThrow(
      /read file.*not found/,
    )
  })
})

describe("writeFileSyncOrAbort", () => {
  it("writes file contents", () => {
    const dir = workspace.dir("writefile-test")
    const filePath = join(dir, "out.txt")
    writeFileSyncOrAbort(filePath, "content")
    expect(readFileSyncOrAbort(filePath, "utf-8")).toBe("content")
  })

  it("aborts when parent dir does not exist", () => {
    expect(() =>
      writeFileSyncOrAbort("/nonexistent/dir/file.txt", "data"),
    ).toThrow(/write file/)
  })
})
