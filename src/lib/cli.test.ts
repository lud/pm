import { beforeEach, describe, expect, it, vi } from "vitest"

// Capture stdout writes
let output: string[]
const originalWrite = process.stdout.write

beforeEach(() => {
  output = []
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    output.push(String(chunk))
    return true
  })
})

import { debug, error, info, success, warning, write, writeln } from "./cli.js"

describe("output functions", () => {
  it("write outputs without newline", () => {
    write("hello")
    expect(output).toEqual(["hello"])
  })

  it("writeln outputs with newline", () => {
    writeln("hello")
    expect(output).toEqual(["hello\n"])
  })

  it("info is an alias for writeln", () => {
    info("test")
    expect(output).toEqual(["test\n"])
  })

  it("warning outputs yellow text", () => {
    warning("warn")
    expect(output[0]).toContain("warn")
  })

  it("error outputs red text from string", () => {
    error("err")
    expect(output[0]).toContain("err")
  })

  it("error outputs red text from object with message", () => {
    error({ message: "obj err" })
    expect(output[0]).toContain("obj err")
  })

  it("debug outputs cyan text", () => {
    debug("dbg")
    expect(output[0]).toContain("dbg")
  })

  it("success outputs green text", () => {
    success("ok")
    expect(output[0]).toContain("ok")
  })
})
