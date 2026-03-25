import { appendFileSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { parseFrontmatter } from "../lib/frontmatter.js"
import { createTestProject, type TestSetup } from "../lib/test-setup.js"
import {
  createDocument,
  editDocument,
  loadDocument,
  markBlocked,
  markDone,
  readDocument,
  showDocument,
} from "./documents.js"
import { findDocumentById } from "./scanner.js"

const testProject = createTestProject("documents")

const BASIC_SETUP: TestSetup = {
  pmJson: {
    doctypes: {
      feature: { tag: "feat", dir: "context/features", intermediateDir: true },
      spec: { tag: "spec", dir: ".", parent: "feature" },
      task: { tag: "task", dir: ".", parent: "spec" },
    },
  },
  files: {
    "context/features/001.feat.user-auth/001.feat.user-auth.md": {
      title: "User authentication",
      status: "new",
      created_on: "2026-03-20",
    },
    "context/features/001.feat.user-auth/002.spec.login-flow.md": {
      parent: "1.feat.user-auth",
      title: "Login flow",
      status: "new",
      created_on: "2026-03-20",
    },
    "context/features/001.feat.user-auth/003.task.jwt-middleware.md": {
      parent: "2.spec.login-flow",
      title: "Add JWT middleware",
      status: "done",
      created_on: "2026-03-21",
    },
    "context/features/001.feat.user-auth/004.task.session-store.md": {
      parent: "2.spec.login-flow",
      title: "Session store",
      status: "new",
      created_on: "2026-03-21",
    },
  },
}

// ---------------------------------------------------------------------------
// readDocument
// ---------------------------------------------------------------------------

describe("readDocument", () => {
  it("reads document with frontmatter", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    const doc = readDocument(project, 1)
    expect(doc).not.toBeNull()
    expect(doc!.frontmatter.title).toBe("User authentication")
    expect(doc!.frontmatter.status).toBe("new")
    expect(doc!.doctype.name).toBe("feature")
  })

  it("returns null for non-existent document", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    expect(readDocument(project, 999)).toBeNull()
  })

  it("includes body content via loadDocument", () => {
    const { dir, project } = testProject.setup(BASIC_SETUP)
    // Append body content after setup (setup only writes frontmatter)
    const filePath = join(
      dir,
      "context/features/001.feat.user-auth/001.feat.user-auth.md",
    )
    appendFileSync(filePath, "\nFeature for user authentication.\n")

    const file = findDocumentById(project, 1)!
    const doc = loadDocument(file)
    expect(doc.body).toContain("Feature for user authentication")
  })

  it("does not include id in frontmatter", () => {
    const { project } = testProject.setup(BASIC_SETUP)
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
    const { dir, project } = testProject.setup(BASIC_SETUP)
    const specPath = join(
      dir,
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
    const { project } = testProject.setup(BASIC_SETUP)
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
    const { project } = testProject.setup(BASIC_SETUP)
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
    const { project } = testProject.setup(BASIC_SETUP)
    const result = showDocument(project, 1) // feature (root)
    expect(result!.parents).toHaveLength(0)
  })

  it("returns empty children for leaf document", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    const result = showDocument(project, 3) // task (leaf)
    expect(result!.children).toHaveLength(0)
  })

  it("returns null for non-existent document", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    expect(showDocument(project, 999)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// createDocument
// ---------------------------------------------------------------------------

describe("createDocument", () => {
  it("creates a feature document with intermediate dir", () => {
    const { project } = testProject.setup(BASIC_SETUP)
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
    const { project } = testProject.setup(BASIC_SETUP)
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
    const { project } = testProject.setup(BASIC_SETUP)
    const result = createDocument(project, "task", "Write tests", {
      parentId: 2,
    })

    expect(result.id).toBe(5)
    const content = readFileSync(result.path, "utf-8")
    const { data } = parseFrontmatter(content)
    expect(data.parent).toBe("2.spec.login-flow")
  })

  it("throws when required parent is missing", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    expect(() => createDocument(project, "spec", "No parent")).toThrow(
      /requires a parent/,
    )
  })

  it("throws when parent is wrong doctype", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    // Task needs a spec parent, not a feature
    expect(() =>
      createDocument(project, "task", "Bad parent", { parentId: 1 }),
    ).toThrow(/expected "spec"/)
  })

  it("throws when parent does not exist", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    expect(() =>
      createDocument(project, "spec", "Ghost parent", { parentId: 999 }),
    ).toThrow(/not found/)
  })

  it("throws for unknown doctype", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    expect(() => createDocument(project, "bogus", "Nope")).toThrow(
      /Unknown doctype/,
    )
  })

  it("throws when parent given to doctype with no parent config", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    expect(() =>
      createDocument(project, "feature", "Bad", { parentId: 1 }),
    ).toThrow(/does not accept a parent/)
  })

  it("uses custom status when provided", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    const result = createDocument(project, "feature", "Custom", {
      status: "urgent",
    })
    const content = readFileSync(result.path, "utf-8")
    const { data } = parseFrontmatter(content)
    expect(data.status).toBe("urgent")
  })

  it("merges setProperties into frontmatter", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    const result = createDocument(project, "feature", "With props", {
      setProperties: { estimate: 3, blocked: false, owner: "alice" },
    })

    const content = readFileSync(result.path, "utf-8")
    const { data } = parseFrontmatter(content)
    expect(data.estimate).toBe(3)
    expect(data.blocked).toBe(false)
    expect(data.owner).toBe("alice")
  })

  it("places spec in parent feature's self directory", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    const result = createDocument(project, "spec", "Nested spec", {
      parentId: 1,
    })
    // Feature 1 has intermediateDir, so its self dir is its own directory
    expect(result.path).toContain("001.feat.user-auth")
  })

  it("overflows idMask without problems", () => {
    const { project } = testProject.setup({
      pmJson: {
        idMask: "0",
        doctypes: { feature: { tag: "feat", dir: "features" } },
      },
      files: {
        "features/9.feat.nine/9.feat.nine.md": {
          title: "Feature nine",
          status: "new",
        },
      },
    })

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
    const { project } = testProject.setup(BASIC_SETUP)
    const doc = editDocument(project, 1, {
      setProperties: { status: "in-progress" },
    })
    expect(doc.frontmatter.status).toBe("in-progress")
  })

  it("updates multiple properties", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    const doc = editDocument(project, 1, {
      setProperties: { status: "done", priority: "high" },
    })
    expect(doc.frontmatter.status).toBe("done")
    expect(doc.frontmatter.priority).toBe("high")
  })

  it("preserves typed values when updating properties", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    const doc = editDocument(project, 1, {
      setProperties: { retries: -2, ratio: 3.14, blocked: true },
    })

    expect(doc.frontmatter.retries).toBe(-2)
    expect(doc.frontmatter.ratio).toBe(3.14)
    expect(doc.frontmatter.blocked).toBe(true)
  })

  it("sets parent as ref string", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    const doc = editDocument(project, 4, { setParent: 2 })
    expect(doc.frontmatter.parent).toBe("2.spec.login-flow")
  })

  it("throws when setting parent to wrong doctype", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    // Task needs spec parent, not feature
    expect(() => editDocument(project, 3, { setParent: 1 })).toThrow(
      /expected "spec"/,
    )
  })

  it("throws for non-existent document", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    expect(() =>
      editDocument(project, 999, { setProperties: { status: "done" } }),
    ).toThrow(/not found/)
  })

  it("returns unchanged document when no updates", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    const doc = editDocument(project, 1, {})
    expect(doc.frontmatter.title).toBe("User authentication")
  })
})

// ---------------------------------------------------------------------------
// markDone
// ---------------------------------------------------------------------------

describe("markDone", () => {
  it("sets status to first doneStatus for feature", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    const doc = markDone(project, 1)
    expect(doc.frontmatter.status).toBe("done")
  })

  it("sets status to 'done' for spec", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    const doc = markDone(project, 2)
    expect(doc.frontmatter.status).toBe("done")
  })

  it("sets status to 'done' for task", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    const doc = markDone(project, 4)
    expect(doc.frontmatter.status).toBe("done")
  })

  it("throws for non-existent document", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    expect(() => markDone(project, 999)).toThrow(/not found/)
  })
})

// ---------------------------------------------------------------------------
// markBlocked
// ---------------------------------------------------------------------------

describe("markBlocked", () => {
  it("sets status to first blockedStatus", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    const doc = markBlocked(project, 1)
    expect(doc.frontmatter.status).toBe("blocked")
  })

  it("throws for non-existent document", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    expect(() => markBlocked(project, 999)).toThrow(/not found/)
  })

  it("throws when blockedStatuses is empty", () => {
    const { project } = testProject.setup({
      pmJson: {
        doctypes: {
          feature: {
            tag: "feat",
            dir: "features",
            blockedStatuses: [],
          },
        },
      },
      files: {
        "features/001.feat.test/001.feat.test.md": {
          title: "Test feature",
          status: "new",
        },
      },
    })
    expect(() => markBlocked(project, 1)).toThrow(/no blocked statuses/)
  })
})
