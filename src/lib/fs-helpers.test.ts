import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  mkdirSyncOrThrow,
  readdirSyncOrThrow,
  readFileSyncOrThrow,
  renameSyncOrThrow,
  writeFileSyncOrThrow,
} from "./fs-helpers.js"
import { createTestWorkspace } from "./test-workspace.js"

const workspace = createTestWorkspace("fs-helpers")

describe("success paths", () => {
  it("creates directories, writes, reads and lists files", () => {
    const dir = workspace.dir("ok")
    const sub = join(dir, "sub")
    mkdirSyncOrThrow(sub)
    writeFileSyncOrThrow(join(sub, "a.txt"), "hello")
    expect(readFileSyncOrThrow(join(sub, "a.txt"), "utf-8")).toBe("hello")
    expect(readdirSyncOrThrow(sub)).toContain("a.txt")
  })

  it("renames files", () => {
    const dir = workspace.dir("rename")
    writeFileSync(join(dir, "a.txt"), "a")
    renameSyncOrThrow(join(dir, "a.txt"), join(dir, "b.txt"))
    expect(readdirSyncOrThrow(dir)).toEqual(["b.txt"])
  })
})

describe("error paths", () => {
  it("throws plain Errors with readable messages", () => {
    expect(() => mkdirSyncOrThrow("/nonexistent/path/dir")).toThrow(
      /create directory/,
    )
    expect(() => readdirSyncOrThrow("/nonexistent/dir")).toThrow(
      /read directory: not found: \/nonexistent\/dir/,
    )
    expect(() => readFileSyncOrThrow("/nonexistent/file", "utf-8")).toThrow(
      /read file: not found/,
    )
    expect(() => renameSyncOrThrow("/nonexistent/a", "/nonexistent/b")).toThrow(
      /rename: not found: \/nonexistent\/a → \/nonexistent\/b/,
    )
  })

  it("maps EISDIR to a readable message", () => {
    const dir = workspace.dir("eisdir")
    expect(() => readFileSyncOrThrow(dir, "utf-8")).toThrow(/is a directory/)
  })
})
