import { describe, it, expect } from "vitest"
import { join } from "node:path"
import { resolveProject } from "../lib/project.js"
import { listDocuments, getStatusSummary } from "./listing.js"

const FIXTURE_DIR = join(import.meta.dirname, "../../test/fixtures/basic-project")

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
  it("lists all open documents by default", () => {
    const project = loadFixtureProject()
    const entries = listDocuments(project)
    // Doc 3 is done, so should be excluded
    const ids = entries.map((e) => e.id).sort((a, b) => a - b)
    expect(ids).toEqual([1, 2, 4])
  })

  it("lists closed documents with --closed", () => {
    const project = loadFixtureProject()
    const entries = listDocuments(project, { closed: true })
    const ids = entries.map((e) => e.id)
    expect(ids).toEqual([3])
  })

  it("lists all documents with --open and --closed", () => {
    const project = loadFixtureProject()
    const entries = listDocuments(project, { open: true, closed: true })
    expect(entries).toHaveLength(4)
  })

  it("filters by doctype", () => {
    const project = loadFixtureProject()
    const entries = listDocuments(project, { doctype: "task", open: true, closed: true })
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
    const entries = listDocuments(project, { parentId: 1, open: true, closed: true })
    const ids = entries.map((e) => e.id).sort((a, b) => a - b)
    expect(ids).toEqual([2, 3, 4])
  })

  it("filters descendants of spec (only direct and indirect children)", () => {
    const project = loadFixtureProject()
    // Descendants of spec 2: task 3, task 4
    const entries = listDocuments(project, { parentId: 2, open: true, closed: true })
    const ids = entries.map((e) => e.id).sort((a, b) => a - b)
    expect(ids).toEqual([3, 4])
  })

  it("returns empty for parent with no descendants", () => {
    const project = loadFixtureProject()
    const entries = listDocuments(project, { parentId: 3, open: true, closed: true })
    expect(entries).toHaveLength(0)
  })

  it("includes title from frontmatter", () => {
    const project = loadFixtureProject()
    const entries = listDocuments(project, { open: true, closed: true })
    const feat = entries.find((e) => e.id === 1)
    expect(feat!.title).toBe("User authentication")
  })
})

// ---------------------------------------------------------------------------
// getStatusSummary
// ---------------------------------------------------------------------------

describe("getStatusSummary", () => {
  it("returns open/closed counts per doctype", () => {
    const project = loadFixtureProject()
    const summary = getStatusSummary(project)

    const byDoctype = Object.fromEntries(summary.map((s) => [s.doctype, s]))
    expect(byDoctype.feature).toEqual({ doctype: "feature", open: 1, closed: 0 })
    expect(byDoctype.spec).toEqual({ doctype: "spec", open: 1, closed: 0 })
    expect(byDoctype.task).toEqual({ doctype: "task", open: 1, closed: 1 })
  })
})
