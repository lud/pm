import { describe, it, expect } from "vitest"
import { join } from "node:path"
import { resolveProject } from "../lib/project.js"
import { listDocuments, getStatusSummary } from "./listing.js"
import { createTestWorkspace } from "../lib/test-workspace.js"

const FIXTURE_DIR = join(
  import.meta.dirname,
  "../../test/fixtures/basic-project",
)

const workspace = createTestWorkspace("listing")

function loadFixtureProject() {
  return resolveProject(
    { doctypes: { feature: { dir: "context/features" } } },
    join(FIXTURE_DIR, ".pm.json"),
  )
}

// ---------------------------------------------------------------------------
// listDocuments
// ---------------------------------------------------------------------------

describe("listDocuments", () => {
  it("lists all active documents by default", () => {
    const project = loadFixtureProject()
    const entries = listDocuments(project)
    // Doc 3 is done, so should be excluded
    const ids = entries.map((e) => e.id).sort((a, b) => a - b)
    expect(ids).toEqual([1, 2, 4])
  })

  it("lists done documents with --done", () => {
    const project = loadFixtureProject()
    const entries = listDocuments(project, { done: true })
    const ids = entries.map((e) => e.id)
    expect(ids).toEqual([3])
  })

  it("lists all documents with --active and --done", () => {
    const project = loadFixtureProject()
    const entries = listDocuments(project, { active: true, done: true })
    expect(entries).toHaveLength(4)
  })

  it("filters by doctype", () => {
    const project = loadFixtureProject()
    const entries = listDocuments(project, {
      doctype: "task",
      active: true,
      done: true,
    })
    const ids = entries.map((e) => e.id).sort((a, b) => a - b)
    expect(ids).toEqual([3, 4])
  })

  it("filters by exact status", () => {
    const project = loadFixtureProject()
    const entries = listDocuments(project, { status: "done" })
    expect(entries).toHaveLength(1)
    expect(entries[0].id).toBe(3)
  })

  it("filters by parent (descendants)", () => {
    const project = loadFixtureProject()
    // Descendants of feature 1: spec 2, task 3, task 4
    const entries = listDocuments(project, {
      parentId: 1,
      active: true,
      done: true,
    })
    const ids = entries.map((e) => e.id).sort((a, b) => a - b)
    expect(ids).toEqual([2, 3, 4])
  })

  it("filters descendants of spec (only direct and indirect children)", () => {
    const project = loadFixtureProject()
    // Descendants of spec 2: task 3, task 4
    const entries = listDocuments(project, {
      parentId: 2,
      active: true,
      done: true,
    })
    const ids = entries.map((e) => e.id).sort((a, b) => a - b)
    expect(ids).toEqual([3, 4])
  })

  it("returns empty for parent with no descendants", () => {
    const project = loadFixtureProject()
    const entries = listDocuments(project, {
      parentId: 3,
      active: true,
      done: true,
    })
    expect(entries).toHaveLength(0)
  })

  it("includes title from frontmatter", () => {
    const project = loadFixtureProject()
    const entries = listDocuments(project, { active: true, done: true })
    const feat = entries.find((e) => e.id === 1)
    expect(feat!.title).toBe("User authentication")
  })

  it("sorts results by ID, not by filesystem order", () => {
    // Create files where path order differs from ID order
    // With idMask "0", ID 9 sorts before ID 10 in filesystem (9. < 10. lexically?
    // Actually "9." > "10." lexically since '9' > '1'. So let's use IDs that
    // clearly differ: ID 2 and ID 10, where "10." < "2." lexically)
    const dir = workspace.dir("sort-by-id")
    const { mkdirSync, writeFileSync } = require("node:fs")
    const featDir = join(dir, "features")
    mkdirSync(featDir, { recursive: true })
    writeFileSync(
      join(dir, ".pm.json"),
      JSON.stringify({
        idMask: "0",
        doctypes: { feature: { dir: "features" } },
      }),
    )
    // ID 10 comes before ID 2 in lexical filesystem order ("10." < "2.")
    mkdirSync(join(featDir, "10.feat.ten"), { recursive: true })
    writeFileSync(
      join(featDir, "10.feat.ten", "10.feat.ten.md"),
      "---\ntitle: Ten\nstatus: new\n---\n",
    )
    mkdirSync(join(featDir, "2.feat.two"), { recursive: true })
    writeFileSync(
      join(featDir, "2.feat.two", "2.feat.two.md"),
      "---\ntitle: Two\nstatus: new\n---\n",
    )

    const project = resolveProject(
      { idMask: "0", doctypes: { feature: { dir: "features" } } },
      join(dir, ".pm.json"),
    )
    const entries = listDocuments(project, { active: true, done: true })
    const ids = entries.map((e) => e.id)
    // Should be sorted by numeric ID, not filesystem order
    expect(ids).toEqual([2, 10])
  })
})

// ---------------------------------------------------------------------------
// getStatusSummary
// ---------------------------------------------------------------------------

describe("getStatusSummary", () => {
  it("returns active/done counts per doctype", () => {
    const project = loadFixtureProject()
    const summary = getStatusSummary(project)

    const byDoctype = Object.fromEntries(summary.map((s) => [s.doctype, s]))
    expect(byDoctype.feature).toEqual({
      doctype: "feature",
      active: 1,
      done: 0,
    })
    expect(byDoctype.spec).toEqual({ doctype: "spec", active: 1, done: 0 })
    expect(byDoctype.task).toEqual({ doctype: "task", active: 1, done: 1 })
  })
})
