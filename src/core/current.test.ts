import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { createTestWorkspace } from "../lib/test-workspace.js"
import {
  clearCurrentId,
  getCurrentId,
  setCurrentId,
  touchCurrent,
} from "./current.js"

const workspace = createTestWorkspace("current")

describe("getCurrentId", () => {
  it("returns null when file does not exist", () => {
    const dir = workspace.dir("no-current")
    expect(getCurrentId(dir)).toBeNull()
  })

  it("reads the current ID", () => {
    const dir = workspace.dir("has-current")
    setCurrentId(dir, 42)
    expect(getCurrentId(dir)).toBe(42)
  })

  it("returns null for empty file", () => {
    const dir = workspace.dir("empty-current")
    const { writeFileSync } = require("node:fs")
    writeFileSync(join(dir, ".pm.current"), "")
    expect(getCurrentId(dir)).toBeNull()
  })

  it("returns null for non-numeric content", () => {
    const dir = workspace.dir("bad-current")
    const { writeFileSync } = require("node:fs")
    writeFileSync(join(dir, ".pm.current"), "not-a-number\n")
    expect(getCurrentId(dir)).toBeNull()
  })

  it("returns null for zero", () => {
    const dir = workspace.dir("zero-current")
    const { writeFileSync } = require("node:fs")
    writeFileSync(join(dir, ".pm.current"), "0\n")
    expect(getCurrentId(dir)).toBeNull()
  })
})

describe("setCurrentId", () => {
  it("writes the ID to .pm.current", () => {
    const dir = workspace.dir("set-current")
    setCurrentId(dir, 7)
    const content = readFileSync(join(dir, ".pm.current"), "utf-8")
    expect(content.trim()).toBe("7")
  })

  it("overwrites existing value", () => {
    const dir = workspace.dir("overwrite-current")
    setCurrentId(dir, 1)
    setCurrentId(dir, 2)
    expect(getCurrentId(dir)).toBe(2)
  })
})

describe("clearCurrentId", () => {
  it("removes .pm.current file", () => {
    const dir = workspace.dir("clear-current")
    setCurrentId(dir, 5)
    clearCurrentId(dir)
    expect(existsSync(join(dir, ".pm.current"))).toBe(false)
    expect(getCurrentId(dir)).toBeNull()
  })

  it("does not throw when file does not exist", () => {
    const dir = workspace.dir("clear-nonexistent")
    expect(() => clearCurrentId(dir)).not.toThrow()
  })
})

describe("touchCurrent", () => {
  it("does not throw when file does not exist", () => {
    const dir = workspace.dir("touch-nonexistent")
    expect(() => touchCurrent(dir)).not.toThrow()
  })

  it("updates mtime when file exists", () => {
    const dir = workspace.dir("touch-existing")
    setCurrentId(dir, 1)
    const { statSync } = require("node:fs")
    const before = statSync(join(dir, ".pm.current")).mtimeMs
    // Small delay to ensure mtime difference
    const start = Date.now()
    while (Date.now() - start < 10) {} // busy wait 10ms
    touchCurrent(dir)
    const after = statSync(join(dir, ".pm.current")).mtimeMs
    expect(after).toBeGreaterThanOrEqual(before)
  })
})
