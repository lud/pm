import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"

vi.mock("../lib/cli.js", async () => {
  const actual = (await vi.importActual("../lib/cli.js")) as Record<
    string,
    unknown
  >
  return {
    ...actual,
    abortError: vi.fn((msg: string) => {
      throw new Error(msg)
    }),
  }
})

import { parseFrontmatter } from "../lib/frontmatter.js"
import { loadProjectFile } from "../lib/project.js"
import { createTestProject } from "../lib/test-setup.js"
import { collectAllDocuments } from "./scanner.js"
import { applyTidyPlan, buildTidyPlan, type DocumentEntry } from "./tidy.js"

const BASIC_DOCTYPES = {
  feature: { tag: "feat", dir: "context/features", intermediateDir: true },
  spec: { tag: "spec", dir: ".", parent: "feature" },
  task: { tag: "task", dir: ".", parent: "spec" },
}

const BASIC_SETUP = {
  pmJson: {
    doctypes: BASIC_DOCTYPES,
  },
  files: {
    "context/features/001.feat.user-auth/001.feat.user-auth.md": {
      title: "User authentication",
      status: "new",
    },
    "context/features/001.feat.user-auth/002.spec.login-flow.md": {
      parent: "1.feat.user-auth",
      title: "Login flow",
      status: "new",
    },
    "context/features/001.feat.user-auth/003.task.jwt-middleware.md": {
      parent: "2.spec.login-flow",
      title: "Add JWT middleware",
      status: "done",
    },
    "context/features/001.feat.user-auth/004.task.session-store.md": {
      parent: "2.spec.login-flow",
      title: "Session store",
      status: "new",
    },
  },
}

const DUPE_SETUP = {
  pmJson: {
    doctypes: BASIC_DOCTYPES,
  },
  files: {
    "context/features/001.feat.auth/001.feat.auth.md": {
      title: "Auth feature",
      status: "new",
    },
    "context/features/001.feat.auth/002.spec.login.md": {
      parent: "1.feat.auth",
      title: "Login spec",
      status: "new",
    },
    "context/features/001.feat.auth/002.spec.signup.md": {
      parent: "1.feat.auth",
      title: "Signup spec",
      status: "new",
    },
    "context/features/001.feat.auth/003.task.form.md": {
      parent: "2.spec.login",
      title: "Build login form",
      status: "new",
    },
  },
}

const testProject = createTestProject("tidy")

function reloadProject(projectDir: string) {
  return loadProjectFile(join(projectDir, ".pm.json"))
}

// ---------------------------------------------------------------------------
// Already tidy project
// ---------------------------------------------------------------------------

describe("buildTidyPlan on clean project", () => {
  it("reports no changes needed", async () => {
    const { project } = testProject.setup(BASIC_SETUP)
    const plan = await buildTidyPlan(project)
    expect(plan.duplicateGroups.size).toBe(0)
    expect(plan.orphans).toHaveLength(0)
    expect(plan.edits).toHaveLength(0)
    expect(plan.moves).toHaveLength(0)
  })

  it("has a mapping for every document", async () => {
    const { project } = testProject.setup(BASIC_SETUP)
    const plan = await buildTidyPlan(project)
    expect(plan.mappings).toHaveLength(4)
    for (const m of plan.mappings) {
      expect(m.idChanged).toBe(false)
      expect(m.pathChanged).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// idMask repadding
// ---------------------------------------------------------------------------

describe("buildTidyPlan with idMask change", () => {
  it("renames intermediate directories when repadding", async () => {
    const { dir } = testProject.setup({
      pmJson: { idMask: "0", doctypes: BASIC_DOCTYPES },
      files: BASIC_SETUP.files,
    })

    const project = reloadProject(dir)
    const plan = await buildTidyPlan(project)

    // Every file gets its own move operation
    expect(plan.moves).toHaveLength(4)

    // Feature file moves into new directory
    const featMove = plan.moves.find((m) =>
      m.from.includes("001.feat.user-auth.md"),
    )
    expect(featMove).toBeDefined()
    expect(featMove!.to).toContain("1.feat.user-auth/1.feat.user-auth.md")
    // The parent directory in the target must NOT contain "001"
    expect(featMove!.to).not.toMatch(/001\.feat/)

    // Children must reference the NEW parent directory name, not the old one
    const specMove = plan.moves.find((m) =>
      m.from.includes("002.spec.login-flow"),
    )
    expect(specMove).toBeDefined()
    expect(specMove!.to).toContain("1.feat.user-auth/2.spec.login-flow.md")
    expect(specMove!.to).not.toMatch(/001\.feat/)

    const taskMove = plan.moves.find((m) =>
      m.from.includes("003.task.jwt-middleware"),
    )
    expect(taskMove).toBeDefined()
    expect(taskMove!.to).toContain("1.feat.user-auth/3.task.jwt-middleware.md")
    expect(taskMove!.to).not.toMatch(/001\.feat/)
  })

  it("applies repadding end-to-end", async () => {
    const { dir } = testProject.setup({
      pmJson: { idMask: "0", doctypes: BASIC_DOCTYPES },
      files: BASIC_SETUP.files,
    })

    const project = reloadProject(dir)
    const plan = await buildTidyPlan(project)
    applyTidyPlan(plan)

    // Re-scan and verify
    const newProject = reloadProject(dir)
    const docs = collectAllDocuments(newProject)
    const ids = docs.map((d) => d.id).sort((a, b) => a - b)
    expect(ids).toEqual([1, 2, 3, 4])

    // Verify the feature directory was renamed
    const feat = docs.find((d) => d.id === 1)
    expect(feat).toBeDefined()
    expect(feat!.path).toContain("1.feat.user-auth/1.feat.user-auth.md")
    expect(feat!.path).not.toContain("001.")

    // Verify children are inside the renamed directory
    const spec = docs.find((d) => d.id === 2)
    expect(spec).toBeDefined()
    expect(spec!.path).toContain("1.feat.user-auth/2.spec.login-flow.md")

    // Verify idempotent
    const plan2 = await buildTidyPlan(newProject)
    expect(plan2.moves).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Duplicate IDs
// ---------------------------------------------------------------------------

describe("buildTidyPlan with duplicates", () => {
  it("detects duplicate IDs", async () => {
    const { project } = testProject.setup(DUPE_SETUP)
    const plan = await buildTidyPlan(project)
    expect(plan.duplicateGroups.size).toBe(1)
    expect(plan.duplicateGroups.has(2)).toBe(true)

    const group = plan.duplicateGroups.get(2)!
    expect(group).toHaveLength(2)
    // Sorted by path — login comes before signup alphabetically
    expect(group[0].slug).toBe("login")
    expect(group[1].slug).toBe("signup")
  })

  it("assigns a new ID to the second duplicate", async () => {
    const { project } = testProject.setup(DUPE_SETUP)
    const plan = await buildTidyPlan(project)

    const signupMapping = plan.mappings.find((m) => m.doc.slug === "signup")
    expect(signupMapping).toBeDefined()
    expect(signupMapping!.idChanged).toBe(true)
    expect(signupMapping!.newId).toBe(4) // max existing is 3, next is 4
  })

  it("keeps the first duplicate's ID unchanged", async () => {
    const { project } = testProject.setup(DUPE_SETUP)
    const plan = await buildTidyPlan(project)

    const loginMapping = plan.mappings.find((m) => m.doc.slug === "login")
    expect(loginMapping).toBeDefined()
    expect(loginMapping!.idChanged).toBe(false)
    expect(loginMapping!.newId).toBe(2)
  })

  it("auto-resolves child parent ref using slug hint", async () => {
    const { project } = testProject.setup(DUPE_SETUP)
    const plan = await buildTidyPlan(project)

    // Task 003 references "2.spec.login" — auto-resolves to login spec
    // Login keeps ID 2, so no edit needed for this child
    const taskEdits = plan.edits.filter((e) => e.path.includes("003.task"))
    expect(taskEdits).toHaveLength(0)
  })

  it("generates a move for the renamed duplicate", async () => {
    const { project } = testProject.setup(DUPE_SETUP)
    const plan = await buildTidyPlan(project)

    // signup gets new ID 4 → file should move to 004.spec.signup.md
    const signupMove = plan.moves.find((m) =>
      m.from.includes("002.spec.signup"),
    )
    expect(signupMove).toBeDefined()
    expect(signupMove!.to).toContain("004.spec.signup.md")
  })
})

// ---------------------------------------------------------------------------
// Orphans
// ---------------------------------------------------------------------------

describe("buildTidyPlan with orphans", () => {
  it("detects documents with required parent missing from frontmatter", async () => {
    const { project } = testProject.setup({
      pmJson: { doctypes: BASIC_DOCTYPES },
      files: {
        "context/features/001.feat.test/001.feat.test.md": {
          title: "Test feature",
          status: "new",
        },
        "context/features/001.feat.test/002.spec.no-parent.md": {
          title: "Spec without parent",
          status: "new",
        },
      },
    })

    const plan = await buildTidyPlan(project)
    expect(plan.orphans).toHaveLength(1)
    expect(plan.orphans[0].slug).toBe("no-parent")
  })

  it("does not relocate orphaned documents", async () => {
    const { project } = testProject.setup({
      pmJson: { doctypes: BASIC_DOCTYPES },
      files: {
        "context/features/001.feat.test/001.feat.test.md": {
          title: "Test feature",
          status: "new",
        },
        "context/features/001.feat.test/002.spec.no-parent.md": {
          title: "Spec without parent",
          status: "new",
        },
      },
    })

    const plan = await buildTidyPlan(project)

    // Should be an orphan
    expect(plan.orphans).toHaveLength(1)
    // Should NOT be relocated to project root
    expect(plan.moves).toHaveLength(0)
  })

  it("detects documents whose parent does not exist", async () => {
    const { project } = testProject.setup({
      pmJson: { doctypes: BASIC_DOCTYPES },
      files: {
        "context/features/001.feat.test/001.feat.test.md": {
          title: "Test feature",
          status: "new",
        },
        "context/features/001.feat.test/002.spec.orphan.md": {
          parent: "999.feat.nonexistent",
          title: "Orphan spec",
          status: "new",
        },
      },
    })

    const plan = await buildTidyPlan(project)
    expect(plan.orphans).toHaveLength(1)
    expect(plan.orphans[0].slug).toBe("orphan")
  })
})

// ---------------------------------------------------------------------------
// Bare numeric parent refs
// ---------------------------------------------------------------------------

describe("buildTidyPlan with bare numeric parent refs", () => {
  it("expands a numeric parent to a full reference", async () => {
    const { project } = testProject.setup({
      pmJson: { doctypes: BASIC_DOCTYPES },
      files: {
        "context/features/001.feat.test/001.feat.test.md": {
          title: "Test feature",
          status: "new",
        },
        "context/features/001.feat.test/002.spec.login.md": {
          parent: 1,
          title: "Login spec",
          status: "new",
        },
      },
    })

    const plan = await buildTidyPlan(project)

    expect(plan.edits).toHaveLength(1)
    expect(plan.edits[0].newParentRef).toBe("1.feat.test")
  })

  it("does not edit a parent ref that is already a full reference", async () => {
    const { project } = testProject.setup({
      pmJson: { doctypes: BASIC_DOCTYPES },
      files: {
        "context/features/001.feat.test/001.feat.test.md": {
          title: "Test feature",
          status: "new",
        },
        "context/features/001.feat.test/002.spec.login.md": {
          parent: "1.feat.test",
          title: "Login spec",
          status: "new",
        },
      },
    })

    const plan = await buildTidyPlan(project)

    expect(plan.edits).toHaveLength(0)
  })

  it("applies bare parent fix end-to-end", async () => {
    const { dir, project } = testProject.setup({
      pmJson: { doctypes: BASIC_DOCTYPES },
      files: {
        "context/features/001.feat.test/001.feat.test.md": {
          title: "Test feature",
          status: "new",
        },
        "context/features/001.feat.test/002.spec.login.md": {
          parent: 1,
          title: "Login spec",
          status: "new",
        },
      },
    })

    const plan = await buildTidyPlan(project)
    applyTidyPlan(plan)

    // Verify the file was updated
    const featDir = join(dir, "context", "features", "001.feat.test")
    const content = readFileSync(join(featDir, "002.spec.login.md"), "utf-8")
    const { data } = parseFrontmatter(content)
    expect(data.parent).toBe("1.feat.test")

    // Verify idempotent
    const project2 = reloadProject(dir)
    const plan2 = await buildTidyPlan(project2)
    expect(plan2.edits).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Prompt for parent (ambiguous duplicate)
// ---------------------------------------------------------------------------

describe("buildTidyPlan with ambiguous duplicate parent", () => {
  it("calls promptForParent when slug hint does not match", async () => {
    const { project } = testProject.setup({
      pmJson: { doctypes: BASIC_DOCTYPES },
      files: {
        "context/features/001.feat.test/001.feat.test.md": {
          title: "Test",
          status: "new",
        },
        "context/features/001.feat.test/002.spec.alpha.md": {
          parent: "1.feat.test",
          title: "Alpha",
          status: "new",
        },
        "context/features/001.feat.test/002.spec.beta.md": {
          parent: "1.feat.test",
          title: "Beta",
          status: "new",
        },
        "context/features/001.feat.test/003.task.child.md": {
          parent: "2.spec.gamma",
          title: "Child task",
          status: "new",
        },
      },
    })

    let promptCalled = false
    const mockPrompt = async (
      _doc: DocumentEntry,
      candidates: DocumentEntry[],
    ): Promise<DocumentEntry | null> => {
      promptCalled = true
      expect(candidates).toHaveLength(2)
      // Select alpha as the parent
      return candidates.find((c) => c.slug === "alpha") ?? null
    }

    const plan = await buildTidyPlan(project, mockPrompt)
    expect(promptCalled).toBe(true)

    // Should have an edit for the child updating to alpha's (possibly new) ID
    const childEdits = plan.edits.filter((e) => e.path.includes("003.task"))
    expect(childEdits).toHaveLength(1)
    // Alpha keeps ID 2 (first by path), so ref should be "2.spec.alpha"
    expect(childEdits[0].newParentRef).toBe("2.spec.alpha")
  })
})

// ---------------------------------------------------------------------------
// Apply plan (end-to-end)
// ---------------------------------------------------------------------------

describe("applyTidyPlan", () => {
  it("renames duplicate files on disk", async () => {
    const { dir, project } = testProject.setup(DUPE_SETUP)
    const plan = await buildTidyPlan(project)
    applyTidyPlan(plan)

    // Re-scan from project dir
    const newProject = reloadProject(dir)
    const newDocs = collectAllDocuments(newProject)
    const ids = newDocs.map((d) => d.id).sort((a, b) => a - b)
    expect(ids).toEqual([1, 2, 3, 4])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("preserves file content after rename", async () => {
    const { dir, project } = testProject.setup(DUPE_SETUP)
    const plan = await buildTidyPlan(project)
    applyTidyPlan(plan)

    const newProject = reloadProject(dir)
    const newDocs = collectAllDocuments(newProject)
    const signup = newDocs.find((d) => d.slug === "signup")
    expect(signup).toBeDefined()
    expect(signup!.id).toBe(4)

    const content = readFileSync(signup!.path, "utf-8")
    const { data } = parseFrontmatter(content)
    expect(data.title).toBe("Signup spec")
  })

  it("updates parent refs when parent ID changes", async () => {
    const { dir, project } = testProject.setup({
      pmJson: { doctypes: BASIC_DOCTYPES },
      files: {
        "context/features/001.feat.test/001.feat.test.md": {
          title: "Test",
          status: "new",
        },
        "context/features/001.feat.test/002.spec.alpha.md": {
          parent: "1.feat.test",
          title: "Alpha",
          status: "new",
        },
        "context/features/001.feat.test/002.spec.beta.md": {
          parent: "1.feat.test",
          title: "Beta",
          status: "new",
        },
        "context/features/001.feat.test/003.task.child.md": {
          parent: "2.spec.beta",
          title: "Child",
          status: "new",
        },
      },
    })

    const plan = await buildTidyPlan(project)

    // Beta is second by path order, gets new ID 4
    const betaMapping = plan.mappings.find((m) => m.doc.slug === "beta")
    expect(betaMapping!.newId).toBe(4)

    // Child should have an edit to update parent ref to "4.spec.beta"
    const childEdits = plan.edits.filter((e) => e.path.includes("003.task"))
    expect(childEdits).toHaveLength(1)
    expect(childEdits[0].newParentRef).toBe("4.spec.beta")

    // Apply and verify
    applyTidyPlan(plan)

    const newProject = reloadProject(dir)
    const newDocs = collectAllDocuments(newProject)
    const child = newDocs.find((d) => d.slug === "child")
    expect(child).toBeDefined()
    const childContent = readFileSync(child!.path, "utf-8")
    const { data } = parseFrontmatter(childContent)
    expect(data.parent).toBe("4.spec.beta")
  })

  it("is idempotent — running twice produces no further changes", async () => {
    const { dir, project } = testProject.setup(DUPE_SETUP)
    const plan1 = await buildTidyPlan(project)
    applyTidyPlan(plan1)

    const newProject = reloadProject(dir)
    const plan2 = await buildTidyPlan(newProject)
    expect(plan2.duplicateGroups.size).toBe(0)
    expect(plan2.edits).toHaveLength(0)
    expect(plan2.moves).toHaveLength(0)
    expect(plan2.orphans).toHaveLength(0)
  })
})
