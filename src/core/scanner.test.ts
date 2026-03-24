import { describe, it, expect } from "vitest"
import {
  parseDocumentFilename,
  formatDocumentFilename,
  parseDocumentRef,
  scanDocuments,
  findDocumentById,
  collectAllDocuments,
  getNextId,
} from "./scanner.js"
import { resolveProject } from "../lib/project.js"
import { createTestProject, type TestSetup } from "../lib/test-setup.js"

// ---------------------------------------------------------------------------
// Filename parsing
// ---------------------------------------------------------------------------

describe("parseDocumentFilename", () => {
  it("parses a valid filename", () => {
    expect(parseDocumentFilename("001.feat.user-auth.md")).toEqual({
      id: 1,
      tag: "feat",
      slug: "user-auth",
    })
  })

  it("parses with different padding widths", () => {
    expect(parseDocumentFilename("00005.spec.login-flow.md")).toEqual({
      id: 5,
      tag: "spec",
      slug: "login-flow",
    })
  })

  it("parses slug with multiple dots", () => {
    expect(parseDocumentFilename("010.task.add-jwt.v2.md")).toEqual({
      id: 10,
      tag: "task",
      slug: "add-jwt.v2",
    })
  })

  it("returns null for non-matching filenames", () => {
    expect(parseDocumentFilename("readme.md")).toBeNull()
    expect(parseDocumentFilename("no-id.feat.something.md")).toBeNull()
    expect(parseDocumentFilename("001.feat.md")).toBeNull() // no slug
    expect(parseDocumentFilename("001..slug.md")).toBeNull() // empty tag
    expect(parseDocumentFilename("not-a-file.txt")).toBeNull()
  })

  it("returns null for directories", () => {
    expect(parseDocumentFilename("001.feat.user-auth")).toBeNull()
  })
})

describe("formatDocumentFilename", () => {
  it("formats with default 3-digit padding", () => {
    expect(formatDocumentFilename(1, "feat", "user-auth")).toBe(
      "001.feat.user-auth.md",
    )
  })

  it("formats with custom padding", () => {
    expect(formatDocumentFilename(5, "spec", "login", 5)).toBe(
      "00005.spec.login.md",
    )
  })

  it("does not truncate IDs exceeding pad width", () => {
    expect(formatDocumentFilename(1234, "task", "big", 3)).toBe(
      "1234.task.big.md",
    )
  })
})

describe("parseDocumentRef", () => {
  it("parses plain integer", () => {
    expect(parseDocumentRef("5")).toBe(5)
  })

  it("parses zero-padded integer", () => {
    expect(parseDocumentRef("005")).toBe(5)
    expect(parseDocumentRef("0001")).toBe(1)
  })

  it("returns null for non-integer", () => {
    expect(parseDocumentRef("abc")).toBeNull()
    expect(parseDocumentRef("")).toBeNull()
    expect(parseDocumentRef("1.5")).toBeNull()
  })

  it("returns null for zero", () => {
    expect(parseDocumentRef("0")).toBeNull()
    expect(parseDocumentRef("000")).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Scanner (uses declarative test project setup)
// ---------------------------------------------------------------------------

const testProject = createTestProject("scanner")

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

describe("scanDocuments", () => {
  it("yields all documents from fixture", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    const docs = collectAllDocuments(project)
    const ids = docs.map((d) => d.id).sort((a, b) => a - b)
    expect(ids).toEqual([1, 2, 3, 4])
  })

  it("assigns correct tags", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    const docs = collectAllDocuments(project)
    const byId = Object.fromEntries(docs.map((d) => [d.id, d]))
    expect(byId[1].tag).toBe("feat")
    expect(byId[2].tag).toBe("spec")
    expect(byId[3].tag).toBe("task")
    expect(byId[4].tag).toBe("task")
  })

  it("ignores non-document files", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    const docs = collectAllDocuments(project)
    // Should only find .md files with valid {id}.{tag}.{slug}.md pattern
    for (const doc of docs) {
      expect(doc.tag).toMatch(/^[a-zA-Z]/)
      expect(doc.id).toBeGreaterThan(0)
    }
  })
})

describe("findDocumentById", () => {
  it("finds existing document", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    const doc = findDocumentById(project, 2)
    expect(doc).not.toBeNull()
    expect(doc!.tag).toBe("spec")
    expect(doc!.slug).toBe("login-flow")
  })

  it("returns null for non-existent ID", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    expect(findDocumentById(project, 999)).toBeNull()
  })
})

describe("getNextId", () => {
  it("returns max + 1 from fixture", () => {
    const { project } = testProject.setup(BASIC_SETUP)
    expect(getNextId(project)).toBe(5)
  })

  it("returns 1 when no documents exist", () => {
    const { project } = testProject.setup({
      pmJson: {
        doctypes: { feature: { tag: "feat", dir: "nonexistent" } },
      },
      files: {},
    })
    expect(getNextId(project)).toBe(1)
  })
})
