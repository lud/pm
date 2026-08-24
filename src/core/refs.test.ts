import { describe, expect, it } from "vitest"
import {
  formatDocRef,
  formatGroupRef,
  formatRef,
  parseDepends,
  parseNodeRef,
  parseRefId,
} from "./refs.js"

const pad3 = (id: number) => String(id).padStart(3, "0")

describe("formatDocRef / formatGroupRef / formatRef", () => {
  it("formats a doc reference", () => {
    expect(formatDocRef(1, "feat", "user-auth")).toBe("1.feat.user-auth")
  })

  it("does not zero-pad the ID by default", () => {
    expect(formatDocRef(5, "spec", "login")).toBe("5.spec.login")
    expect(formatGroupRef(5, "backlog")).toBe("5.backlog")
  })

  it("formats the ID with the supplied formatId", () => {
    expect(formatDocRef(5, "spec", "login", pad3)).toBe("005.spec.login")
    expect(formatGroupRef(5, "backlog", pad3)).toBe("005.backlog")
  })

  it("lets formatId pass through IDs wider than the pad width", () => {
    expect(formatDocRef(1234, "spec", "login", pad3)).toBe("1234.spec.login")
  })

  it("formats a NodeRef by kind", () => {
    expect(
      formatRef({ kind: "doc", id: 1, tag: "feat", slug: "auth" }, pad3),
    ).toBe("001.feat.auth")
    expect(formatRef({ kind: "group", id: 9, slug: "backlog" }, pad3)).toBe(
      "009.backlog",
    )
  })
})

describe("parseNodeRef", () => {
  it("parses a doc reference (three parts)", () => {
    expect(parseNodeRef("1.feat.user-auth")).toEqual({
      kind: "doc",
      id: 1,
      tag: "feat",
      slug: "user-auth",
    })
  })

  it("parses a doc reference with multi-part slug", () => {
    expect(parseNodeRef("42.spec.login-flow.v2")).toEqual({
      kind: "doc",
      id: 42,
      tag: "spec",
      slug: "login-flow.v2",
    })
  })

  it("parses a group reference (two parts)", () => {
    expect(parseNodeRef("12.some-group")).toEqual({
      kind: "group",
      id: 12,
      slug: "some-group",
    })
  })

  it("parses zero-padded IDs", () => {
    expect(parseNodeRef("001.feat.auth")).toEqual({
      kind: "doc",
      id: 1,
      tag: "feat",
      slug: "auth",
    })
    expect(parseNodeRef("012.backlog")).toEqual({
      kind: "group",
      id: 12,
      slug: "backlog",
    })
  })

  it("returns null for invalid formats", () => {
    expect(parseNodeRef("not-valid")).toBeNull()
    expect(parseNodeRef("feat.auth")).toBeNull() // no numeric ID
    expect(parseNodeRef("12")).toBeNull() // bare ID is not a qualified ref
    expect(parseNodeRef("")).toBeNull()
  })
})

describe("parseRefId", () => {
  it("extracts the ID from doc and group refs", () => {
    expect(parseRefId("1.feat.user-auth")).toBe(1)
    expect(parseRefId("42.spec.login")).toBe(42)
    expect(parseRefId("12.some-group")).toBe(12)
  })

  it("accepts bare numbers", () => {
    expect(parseRefId(1)).toBe(1)
    expect(parseRefId(42)).toBe(42)
  })

  it("accepts bare numeric strings, trimmed and zero-padded", () => {
    expect(parseRefId("12")).toBe(12)
    expect(parseRefId(" 012 ")).toBe(12)
  })

  it("returns null for zero, negative, and non-integer numbers", () => {
    expect(parseRefId(0)).toBeNull()
    expect(parseRefId(-1)).toBeNull()
    expect(parseRefId(1.5)).toBeNull()
    expect(parseRefId("0")).toBeNull()
  })

  it("returns null for non-ref values", () => {
    expect(parseRefId(null)).toBeNull()
    expect(parseRefId(undefined)).toBeNull()
    expect(parseRefId("invalid")).toBeNull()
    expect(parseRefId(true)).toBeNull()
    expect(parseRefId({})).toBeNull()
  })
})

describe("parseDepends", () => {
  it("returns an empty list for absent values", () => {
    expect(parseDepends(undefined)).toEqual([])
    expect(parseDepends(null)).toEqual([])
  })

  it("parses a list of bare IDs and qualified refs", () => {
    const entries = parseDepends([12, "34", "5.feat.auth", "7.some-group"])
    expect(entries.map((e) => e.id)).toEqual([12, 34, 5, 7])
    expect(entries[2].ref).toEqual({
      kind: "doc",
      id: 5,
      tag: "feat",
      slug: "auth",
    })
    expect(entries[3].ref).toEqual({
      kind: "group",
      id: 7,
      slug: "some-group",
    })
    expect(entries[0].ref).toBeNull()
  })

  it("treats a scalar as a single-entry list", () => {
    expect(parseDepends(12)).toEqual([{ raw: 12, id: 12, ref: null }])
    const [entry] = parseDepends("3.task.cleanup")
    expect(entry.id).toBe(3)
    expect(entry.ref?.kind).toBe("doc")
  })

  it("keeps malformed entries with a null id, preserving the raw value", () => {
    const entries = parseDepends(["nonsense", 12, {}])
    expect(entries).toHaveLength(3)
    expect(entries[0]).toEqual({ raw: "nonsense", id: null, ref: null })
    expect(entries[1].id).toBe(12)
    expect(entries[2]).toEqual({ raw: {}, id: null, ref: null })
  })
})
