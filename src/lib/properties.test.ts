import { describe, it, expect } from "vitest"
import {
  parsePropertyFlag,
  parsePropertyFlags,
  parsePropertyFilters,
} from "./properties.js"

describe("properties parsing", () => {
  it("parses booleans with YAML-compatible casing", () => {
    expect(parsePropertyFlag("blocked:TRUE", "--set")).toEqual({
      key: "blocked",
      value: true,
    })
    expect(parsePropertyFlag("ready:False", "--set")).toEqual({
      key: "ready",
      value: false,
    })
  })

  it("parses strict round-trip numbers", () => {
    expect(parsePropertyFlag("count:-2", "--set")).toEqual({
      key: "count",
      value: -2,
    })
    expect(parsePropertyFlag("ratio:3.14", "--set")).toEqual({
      key: "ratio",
      value: 3.14,
    })
    expect(parsePropertyFlag("text:123foo", "--set")).toEqual({
      key: "text",
      value: "123foo",
    })
    expect(parsePropertyFlag("exact:1.0", "--set")).toEqual({
      key: "exact",
      value: "1.0",
    })
  })

  it("keeps invalid YAML-ish values as strings", () => {
    expect(parsePropertyFlag("raw:[", "--set")).toEqual({
      key: "raw",
      value: "[",
    })
  })

  it("throws for malformed assignment", () => {
    expect(() => parsePropertyFlag("bad", "--set")).toThrow(
      "Invalid --set format",
    )
    expect(() => parsePropertyFlag(":value", "--set")).toThrow("Missing key")
  })

  it("parses repeated assignments and keeps last value", () => {
    const result = parsePropertyFlags(
      ["status:new", "status:done", "enabled:true"],
      "--set",
    )
    expect(result).toEqual({ status: "done", enabled: true })
  })

  it("parses filter expressions", () => {
    expect(
      parsePropertyFilters(["priority:2", "blocked:false"], "--is"),
    ).toEqual([
      { key: "priority", value: 2 },
      { key: "blocked", value: false },
    ])
  })
})
