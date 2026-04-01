import { describe, expect, it } from "vitest"
import {
  formatParentRef,
  parseFrontmatterId,
  parseParentRef,
} from "./parent-ref.js"

describe("formatParentRef", () => {
  it("formats a parent reference", () => {
    expect(formatParentRef(1, "feat", "user-auth")).toBe("1.feat.user-auth")
  })

  it("does not zero-pad the ID", () => {
    expect(formatParentRef(5, "spec", "login")).toBe("5.spec.login")
  })
})

describe("parseParentRef", () => {
  it("parses a valid reference", () => {
    expect(parseParentRef("1.feat.user-auth")).toEqual({
      id: 1,
      tag: "feat",
      slug: "user-auth",
    })
  })

  it("parses with multi-part slug", () => {
    expect(parseParentRef("42.spec.login-flow.v2")).toEqual({
      id: 42,
      tag: "spec",
      slug: "login-flow.v2",
    })
  })

  it("parses zero-padded ID", () => {
    expect(parseParentRef("001.feat.auth")).toEqual({
      id: 1,
      tag: "feat",
      slug: "auth",
    })
  })

  it("returns null for invalid format", () => {
    expect(parseParentRef("not-valid")).toBeNull()
    expect(parseParentRef("1.feat")).toBeNull() // no slug
    expect(parseParentRef("feat.auth")).toBeNull() // no numeric ID
    expect(parseParentRef("")).toBeNull()
  })
})

describe("parseFrontmatterId", () => {
  it("extracts ID from string ref", () => {
    expect(parseFrontmatterId("1.feat.user-auth")).toBe(1)
    expect(parseFrontmatterId("42.spec.login")).toBe(42)
  })

  it("extracts ID from legacy numeric value", () => {
    expect(parseFrontmatterId(1)).toBe(1)
    expect(parseFrontmatterId(42)).toBe(42)
  })

  it("returns null for zero or negative numbers", () => {
    expect(parseFrontmatterId(0)).toBeNull()
    expect(parseFrontmatterId(-1)).toBeNull()
  })

  it("returns null for non-ref values", () => {
    expect(parseFrontmatterId(null)).toBeNull()
    expect(parseFrontmatterId(undefined)).toBeNull()
    expect(parseFrontmatterId("invalid")).toBeNull()
    expect(parseFrontmatterId(true)).toBeNull()
    expect(parseFrontmatterId({})).toBeNull()
  })
})
