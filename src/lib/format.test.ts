import { describe, it, expect } from "vitest"
import { formatPath } from "./format.js"

describe("formatPath", () => {
  it("returns relative path when child of cwd", () => {
    expect(formatPath("/home/user/project/src/file.ts", "/home/user/project")).toBe("src/file.ts")
  })

  it("returns absolute path when not child of cwd", () => {
    expect(formatPath("/other/path/file.ts", "/home/user/project")).toBe("/other/path/file.ts")
  })

  it("returns '.' when path equals cwd", () => {
    expect(formatPath("/home/user/project", "/home/user/project")).toBe(".")
  })

  it("returns absolute when relative would go up", () => {
    expect(formatPath("/home/user/other/file.ts", "/home/user/project")).toBe("/home/user/other/file.ts")
  })

  it("passes through already-relative paths", () => {
    expect(formatPath("src/file.ts", "/home/user/project")).toBe("src/file.ts")
  })
})
