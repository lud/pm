import { describe, expect, it } from "vitest"
import { formatContentSeparator, formatPath } from "./format.js"

describe("formatPath", () => {
  it("returns relative path when child of cwd", () => {
    expect(
      formatPath("/home/user/project/src/file.ts", "/home/user/project"),
    ).toBe("src/file.ts")
  })

  it("returns absolute path when not child of cwd", () => {
    expect(formatPath("/other/path/file.ts", "/home/user/project")).toBe(
      "/other/path/file.ts",
    )
  })

  it("returns '.' when path equals cwd", () => {
    expect(formatPath("/home/user/project", "/home/user/project")).toBe(".")
  })

  it("returns absolute when relative would go up", () => {
    expect(formatPath("/home/user/other/file.ts", "/home/user/project")).toBe(
      "/home/user/other/file.ts",
    )
  })

  it("passes through already-relative paths", () => {
    expect(formatPath("src/file.ts", "/home/user/project")).toBe("src/file.ts")
  })
})

describe("formatContentSeparator", () => {
  it("pads to at least 60 characters", () => {
    const result = formatContentSeparator("001.feat.auth.md")
    expect(result.startsWith("== CONTENT OF 001.feat.auth.md ")).toBe(true)
    expect(result).toMatch(/=+$/)
    expect(result.length).toBeGreaterThanOrEqual(60)
  })

  it("extends beyond 60 for long filenames", () => {
    const longName = "001.feat.a-very-long-feature-name-that-exceeds-limits.md"
    const result = formatContentSeparator(longName)
    expect(result.startsWith(`== CONTENT OF ${longName} `)).toBe(true)
    expect(result.endsWith("=")).toBe(true)
    expect(result.length).toBeGreaterThanOrEqual(60)
  })
})
