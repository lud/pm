import { describe, expect, it } from "vitest"
import {
  formatFrontmatter,
  hasFrontmatter,
  parseFrontmatter,
  prependFrontmatter,
  setFrontmatterProperties,
  setFrontmatterProperty,
} from "./frontmatter.js"

describe("parseFrontmatter", () => {
  it("parses valid frontmatter", () => {
    const content = "---\ntitle: Hello\nstatus: new\n---\nBody text"
    const result = parseFrontmatter(content)
    expect(result.data).toEqual({ title: "Hello", status: "new" })
    expect(result.body).toBe("Body text")
  })

  it("returns empty data for content without frontmatter", () => {
    const content = "Just some text"
    const result = parseFrontmatter(content)
    expect(result.data).toEqual({})
    expect(result.body).toBe("Just some text")
  })

  it("handles empty frontmatter", () => {
    const content = "---\n---\nBody"
    const result = parseFrontmatter(content)
    expect(result.data).toEqual({})
    expect(result.body).toBe("Body")
  })

  it("handles frontmatter with no trailing content", () => {
    const content = "---\ntitle: Test\n---"
    const result = parseFrontmatter(content)
    expect(result.data).toEqual({ title: "Test" })
    expect(result.body).toBe("")
  })

  it("handles numeric values", () => {
    const content = "---\nid: 5\nparent: 2\n---\n"
    const result = parseFrontmatter(content)
    expect(result.data.id).toBe(5)
    expect(result.data.parent).toBe(2)
  })
})

describe("hasFrontmatter", () => {
  it("returns true for content with frontmatter", () => {
    expect(hasFrontmatter("---\ntitle: Test\n---\nBody")).toBe(true)
  })

  it("returns false for content without frontmatter", () => {
    expect(hasFrontmatter("No frontmatter here")).toBe(false)
  })
})

describe("formatFrontmatter", () => {
  it("formats data as YAML frontmatter", () => {
    const result = formatFrontmatter({ title: "Test", status: "new" })
    expect(result).toBe("---\ntitle: Test\nstatus: new\n---\n")
  })
})

describe("prependFrontmatter", () => {
  it("prepends frontmatter to body", () => {
    const result = prependFrontmatter({ title: "Test" }, "Body content")
    expect(result).toBe("---\ntitle: Test\n---\nBody content")
  })
})

describe("setFrontmatterProperty", () => {
  it("updates an existing property", () => {
    const content = "---\ntitle: Old\nstatus: new\n---\nBody"
    const result = setFrontmatterProperty(content, "status", "done")
    const parsed = parseFrontmatter(result)
    expect(parsed.data.status).toBe("done")
    expect(parsed.data.title).toBe("Old")
    expect(parsed.body).toBe("Body")
  })

  it("adds a new property", () => {
    const content = "---\ntitle: Test\n---\nBody"
    const result = setFrontmatterProperty(content, "status", "new")
    const parsed = parseFrontmatter(result)
    expect(parsed.data.status).toBe("new")
    expect(parsed.data.title).toBe("Test")
  })
})

describe("setFrontmatterProperties", () => {
  it("updates multiple properties at once", () => {
    const content = "---\ntitle: Old\nstatus: new\n---\nBody"
    const result = setFrontmatterProperties(content, {
      status: "done",
      title: "New",
    })
    const parsed = parseFrontmatter(result)
    expect(parsed.data.status).toBe("done")
    expect(parsed.data.title).toBe("New")
    expect(parsed.body).toBe("Body")
  })
})
