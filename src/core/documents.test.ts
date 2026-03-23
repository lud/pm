import { describe, it, expect } from "vitest"
import { join } from "node:path"
import { readFileSync, writeFileSync } from "node:fs"
import { resolveProject } from "../lib/project.js"
import { parseFrontmatter } from "../lib/frontmatter.js"
import { createTestWorkspace } from "../lib/test-workspace.js"
import {
  readDocument,
  showDocument,
  createDocument,
  editDocument,
  markDone,
} from "./documents.js"

const FIXTURE_DIR = join(
  import.meta.dirname,
  "../../test/fixtures/basic-project",
)
const workspace = createTestWorkspace("documents")

function loadFixtureProject() {
  return resolveProject(
    { doctypes: { feature: { dir: "context/features" } } },
    join(FIXTURE_DIR, ".pm.json"),
  )
}

function loadMutableProject() {
  const dir = workspace.copyFixture(FIXTURE_DIR)
  return resolveProject(
    { doctypes: { feature: { dir: "context/features" } } },
    join(dir, ".pm.json"),
  )
}

// ---------------------------------------------------------------------------
// readDocument
// ---------------------------------------------------------------------------

describe("readDocument", () => {
  it("reads document with frontmatter", () => {
    const project = loadFixtureProject()
    const doc = readDocument(project, 1)
    expect(doc).not.toBeNull()
    expect(doc!.frontmatter.title).toBe("User authentication")
    expect(doc!.frontmatter.status).toBe("new")
    expect(doc!.doctype.name).toBe("feature")
  })

  it("returns null for non-existent document", () => {
    const project = loadFixtureProject()
    expect(readDocument(project, 999)).toBeNull()
  })

  it("includes body content", () => {
    const project = loadFixtureProject()
    const doc = readDocument(project, 1)
    expect(doc!.body).toContain("Feature for user authentication")
  })

  it("does not include id in frontmatter", () => {
    const project = loadFixtureProject()
    const doc = readDocument(project, 1)
    expect(doc!.frontmatter.id).toBeUndefined()
    // But the id is available from the filename
    expect(doc!.id).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// showDocument
// ---------------------------------------------------------------------------

describe("showDocument", () => {
  it("resolves hierarchy when child uses numeric parent shorthand", () => {
    const project = loadMutableProject()
    const specPath = join(
      project.projectDir,
      "context/features/001.feat.user-auth/002.spec.login-flow.md",
    )
    const updated = readFileSync(specPath, "utf-8").replace(
      "parent: 1.feat.user-auth",
      "parent: 1",
    )
    writeFileSync(specPath, updated)

    const specView = showDocument(project, 2)
    expect(specView).not.toBeNull()
    expect(specView!.parents).toHaveLength(1)
    expect(specView!.parents[0].id).toBe(1)

    const featureView = showDocument(project, 1)
    expect(featureView).not.toBeNull()
    const childIds = featureView!.children
      .map((c) => c.id)
      .sort((a, b) => a - b)
    expect(childIds).toContain(2)
  })

  it("resolves hierarchy when child uses full parent reference", () => {
    const project = loadFixtureProject()
    const specView = showDocument(project, 2)
    expect(specView).not.toBeNull()
    expect(specView!.parents).toHaveLength(1)
    expect(specView!.parents[0].id).toBe(1)

    const featureView = showDocument(project, 1)
    expect(featureView).not.toBeNull()
    const childIds = featureView!.children
      .map((c) => c.id)
      .sort((a, b) => a - b)
    expect(childIds).toContain(2)
  })

  it("returns document with parents and children", () => {
    const project = loadFixtureProject()
    const result = showDocument(project, 2) // spec
    expect(result).not.toBeNull()
    expect(result!.document.id).toBe(2)
    expect(result!.document.doctype.name).toBe("spec")

    // Should have feature as parent
    expect(result!.parents).toHaveLength(1)
    expect(result!.parents[0].id).toBe(1)
    expect(result!.parents[0].doctype.name).toBe("feature")

    // Should have tasks as children
    expect(result!.children).toHaveLength(2)
    const childIds = result!.children.map((c) => c.id).sort((a, b) => a - b)
    expect(childIds).toEqual([3, 4])
  })

  it("returns empty parents for root document", () => {
    const project = loadFixtureProject()
    const result = showDocument(project, 1) // feature (root)
    expect(result!.parents).toHaveLength(0)
  })

  it("returns empty children for leaf document", () => {
    const project = loadFixtureProject()
    const result = showDocument(project, 3) // task (leaf)
    expect(result!.children).toHaveLength(0)
  })

  it("returns null for non-existent document", () => {
    const project = loadFixtureProject()
    expect(showDocument(project, 999)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// createDocument
// ---------------------------------------------------------------------------

describe("createDocument", () => {
  it("creates a feature document with intermediate dir", () => {
    const project = loadMutableProject()
    const result = createDocument(project, "feature", "Payment system")

    expect(result.id).toBe(5)
    expect(result.path).toContain("005.feat.payment-system")
    expect(result.path).toMatch(/\.md$/)

    // Verify file exists and has correct frontmatter
    const content = readFileSync(result.path, "utf-8")
    const { data } = parseFrontmatter(content)
    expect(data.id).toBeUndefined() // ID comes from filename, not frontmatter
    expect(data.title).toBe("Payment system")
    expect(data.status).toBe("new")
    expect(data.parent).toBeUndefined()
  })

  it("creates a spec document with parent ref string", () => {
    const project = loadMutableProject()
    const result = createDocument(project, "spec", "API design", {
      parentId: 1,
    })

    expect(result.id).toBe(5)
    const content = readFileSync(result.path, "utf-8")
    const { data } = parseFrontmatter(content)
    expect(data.parent).toBe("1.feat.user-auth")
    expect(data.parent).not.toBe(1)
    expect(data.title).toBe("API design")
  })

  it("creates a task document with parent spec ref", () => {
    const project = loadMutableProject()
    const result = createDocument(project, "task", "Write tests", {
      parentId: 2,
    })

    expect(result.id).toBe(5)
    const content = readFileSync(result.path, "utf-8")
    const { data } = parseFrontmatter(content)
    expect(data.parent).toBe("2.spec.login-flow")
  })

  it("throws when required parent is missing", () => {
    const project = loadMutableProject()
    expect(() => createDocument(project, "spec", "No parent")).toThrow(
      /requires a parent/,
    )
  })

  it("throws when parent is wrong doctype", () => {
    const project = loadMutableProject()
    // Task needs a spec parent, not a feature
    expect(() =>
      createDocument(project, "task", "Bad parent", { parentId: 1 }),
    ).toThrow(/expected "spec"/)
  })

  it("throws when parent does not exist", () => {
    const project = loadMutableProject()
    expect(() =>
      createDocument(project, "spec", "Ghost parent", { parentId: 999 }),
    ).toThrow(/not found/)
  })

  it("throws for unknown doctype", () => {
    const project = loadMutableProject()
    expect(() => createDocument(project, "bogus", "Nope")).toThrow(
      /Unknown doctype/,
    )
  })

  it("throws when parent given to doctype with no parent config", () => {
    const project = loadMutableProject()
    expect(() =>
      createDocument(project, "feature", "Bad", { parentId: 1 }),
    ).toThrow(/does not accept a parent/)
  })

  it("uses custom status when provided", () => {
    const project = loadMutableProject()
    const result = createDocument(project, "feature", "Custom", {
      status: "urgent",
    })
    const content = readFileSync(result.path, "utf-8")
    const { data } = parseFrontmatter(content)
    expect(data.status).toBe("urgent")
  })

  it("places spec in parent feature's self directory", () => {
    const project = loadMutableProject()
    const result = createDocument(project, "spec", "Nested spec", {
      parentId: 1,
    })
    // Feature 1 has intermediateDir, so its self dir is its own directory
    expect(result.path).toContain("001.feat.user-auth")
  })

  it("overflows idMask without problems", () => {
    // Create a project with idMask "0" (single digit) and a document with ID 9
    const dir = workspace.dir("overflow-mask")
    const { mkdirSync, writeFileSync } = require("node:fs")
    const featDir = join(dir, "features", "9.feat.nine")
    mkdirSync(featDir, { recursive: true })
    writeFileSync(
      join(dir, ".pm.json"),
      JSON.stringify({
        idMask: "0",
        doctypes: { feature: { dir: "features" } },
      }),
    )
    writeFileSync(
      join(featDir, "9.feat.nine.md"),
      "---\ntitle: Feature nine\nstatus: new\n---\n",
    )

    const project = resolveProject(
      { idMask: "0", doctypes: { feature: { dir: "features" } } },
      join(dir, ".pm.json"),
    )

    // Next ID should be 10, and the filename should be "10.feat.ten.md"
    const result = createDocument(project, "feature", "Ten")
    expect(result.id).toBe(10)
    expect(result.path).toContain("10.feat.ten")
    // The prefix is "10", not "010" — mask is just "0" (single digit)
    expect(result.path).not.toContain("010")
  })
})

// ---------------------------------------------------------------------------
// editDocument
// ---------------------------------------------------------------------------

describe("editDocument", () => {
  it("updates a property", () => {
    const project = loadMutableProject()
    const doc = editDocument(project, 1, {
      setProperties: { status: "in-progress" },
    })
    expect(doc.frontmatter.status).toBe("in-progress")
  })

  it("updates multiple properties", () => {
    const project = loadMutableProject()
    const doc = editDocument(project, 1, {
      setProperties: { status: "done", priority: "high" },
    })
    expect(doc.frontmatter.status).toBe("done")
    expect(doc.frontmatter.priority).toBe("high")
  })

  it("sets parent as ref string", () => {
    const project = loadMutableProject()
    const doc = editDocument(project, 4, { setParent: 2 })
    expect(doc.frontmatter.parent).toBe("2.spec.login-flow")
  })

  it("throws when setting parent to wrong doctype", () => {
    const project = loadMutableProject()
    // Task needs spec parent, not feature
    expect(() => editDocument(project, 3, { setParent: 1 })).toThrow(
      /expected "spec"/,
    )
  })

  it("throws for non-existent document", () => {
    const project = loadMutableProject()
    expect(() =>
      editDocument(project, 999, { setProperties: { status: "done" } }),
    ).toThrow(/not found/)
  })

  it("returns unchanged document when no updates", () => {
    const project = loadMutableProject()
    const doc = editDocument(project, 1, {})
    expect(doc.frontmatter.title).toBe("User authentication")
  })
})

// ---------------------------------------------------------------------------
// markDone
// ---------------------------------------------------------------------------

describe("markDone", () => {
  it("sets status to first doneStatus for feature", () => {
    const project = loadMutableProject()
    const doc = markDone(project, 1)
    expect(doc.frontmatter.status).toBe("done")
  })

  it("sets status to 'specified' for spec", () => {
    const project = loadMutableProject()
    const doc = markDone(project, 2)
    expect(doc.frontmatter.status).toBe("specified")
  })

  it("sets status to 'done' for task", () => {
    const project = loadMutableProject()
    const doc = markDone(project, 4)
    expect(doc.frontmatter.status).toBe("done")
  })

  it("throws for non-existent document", () => {
    const project = loadMutableProject()
    expect(() => markDone(project, 999)).toThrow(/not found/)
  })
})
