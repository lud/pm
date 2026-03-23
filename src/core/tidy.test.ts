import { describe, it, expect } from "vitest"
import { join } from "node:path"
import { readFileSync, existsSync } from "node:fs"
import { resolveProject } from "../lib/project.js"
import { parseFrontmatter } from "../lib/frontmatter.js"
import { createTestWorkspace } from "../lib/test-workspace.js"
import { buildTidyPlan, applyTidyPlan, type DocumentEntry } from "./tidy.js"
import { collectAllDocuments } from "./scanner.js"

const BASIC_FIXTURE = join(
  import.meta.dirname,
  "../../test/fixtures/basic-project",
)
const DUPE_FIXTURE = join(
  import.meta.dirname,
  "../../test/fixtures/tidy-duplicates",
)

const workspace = createTestWorkspace("tidy")

function loadProject(fixtureDir: string) {
  return resolveProject(
    { doctypes: { feature: { dir: "context/features" } } },
    join(fixtureDir, ".pm.json"),
  )
}

function loadMutableProject(fixtureDir: string) {
  const dir = workspace.copyFixture(fixtureDir)
  return resolveProject(
    { doctypes: { feature: { dir: "context/features" } } },
    join(dir, ".pm.json"),
  )
}

function reloadProject(projectDir: string) {
  return resolveProject(
    { doctypes: { feature: { dir: "context/features" } } },
    join(projectDir, ".pm.json"),
  )
}

// ---------------------------------------------------------------------------
// Already tidy project
// ---------------------------------------------------------------------------

describe("buildTidyPlan on clean project", () => {
  it("reports no changes needed", async () => {
    const project = loadProject(BASIC_FIXTURE)
    const plan = await buildTidyPlan(project)
    expect(plan.duplicateGroups.size).toBe(0)
    expect(plan.orphans).toHaveLength(0)
    expect(plan.edits).toHaveLength(0)
    expect(plan.moves).toHaveLength(0)
  })

  it("has a mapping for every document", async () => {
    const project = loadProject(BASIC_FIXTURE)
    const plan = await buildTidyPlan(project)
    expect(plan.mappings).toHaveLength(4)
    for (const m of plan.mappings) {
      expect(m.idChanged).toBe(false)
      expect(m.pathChanged).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// Duplicate IDs
// ---------------------------------------------------------------------------

describe("buildTidyPlan with duplicates", () => {
  it("detects duplicate IDs", async () => {
    const project = loadProject(DUPE_FIXTURE)
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
    const project = loadProject(DUPE_FIXTURE)
    const plan = await buildTidyPlan(project)

    const signupMapping = plan.mappings.find((m) => m.doc.slug === "signup")
    expect(signupMapping).toBeDefined()
    expect(signupMapping!.idChanged).toBe(true)
    expect(signupMapping!.newId).toBe(4) // max existing is 3, next is 4
  })

  it("keeps the first duplicate's ID unchanged", async () => {
    const project = loadProject(DUPE_FIXTURE)
    const plan = await buildTidyPlan(project)

    const loginMapping = plan.mappings.find((m) => m.doc.slug === "login")
    expect(loginMapping).toBeDefined()
    expect(loginMapping!.idChanged).toBe(false)
    expect(loginMapping!.newId).toBe(2)
  })

  it("auto-resolves child parent ref using slug hint", async () => {
    const project = loadProject(DUPE_FIXTURE)
    const plan = await buildTidyPlan(project)

    // Task 003 references "2.spec.login" — auto-resolves to login spec
    // Login keeps ID 2, so no edit needed for this child
    const taskEdits = plan.edits.filter((e) => e.path.includes("003.task"))
    expect(taskEdits).toHaveLength(0)
  })

  it("generates a move for the renamed duplicate", async () => {
    const project = loadProject(DUPE_FIXTURE)
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
  it("detects documents whose parent does not exist", async () => {
    const dir = workspace.dir("orphan-fixture")
    const { mkdirSync, writeFileSync } = require("node:fs")
    const featDir = join(dir, "context", "features", "001.feat.test")
    mkdirSync(featDir, { recursive: true })
    writeFileSync(
      join(dir, ".pm.json"),
      JSON.stringify({
        doctypes: { feature: { dir: "context/features" } },
      }),
    )
    writeFileSync(
      join(featDir, "001.feat.test.md"),
      ["---", "title: Test feature", "status: new", "---", ""].join("\n"),
    )
    writeFileSync(
      join(featDir, "002.spec.orphan.md"),
      [
        "---",
        "parent: 999.feat.nonexistent",
        "title: Orphan spec",
        "status: new",
        "---",
        "",
      ].join("\n"),
    )

    const project = reloadProject(dir)
    const plan = await buildTidyPlan(project)
    expect(plan.orphans).toHaveLength(1)
    expect(plan.orphans[0].slug).toBe("orphan")
  })
})

// ---------------------------------------------------------------------------
// Prompt for parent (ambiguous duplicate)
// ---------------------------------------------------------------------------

describe("buildTidyPlan with ambiguous duplicate parent", () => {
  it("calls promptForParent when slug hint does not match", async () => {
    const dir = workspace.dir("ambiguous-fixture")
    const { mkdirSync, writeFileSync } = require("node:fs")
    const featDir = join(dir, "context", "features", "001.feat.test")
    mkdirSync(featDir, { recursive: true })
    writeFileSync(
      join(dir, ".pm.json"),
      JSON.stringify({
        doctypes: { feature: { dir: "context/features" } },
      }),
    )
    writeFileSync(
      join(featDir, "001.feat.test.md"),
      ["---", "title: Test", "status: new", "---", ""].join("\n"),
    )
    // Two specs with same ID
    writeFileSync(
      join(featDir, "002.spec.alpha.md"),
      [
        "---",
        "parent: 1.feat.test",
        "title: Alpha",
        "status: new",
        "---",
        "",
      ].join("\n"),
    )
    writeFileSync(
      join(featDir, "002.spec.beta.md"),
      [
        "---",
        "parent: 1.feat.test",
        "title: Beta",
        "status: new",
        "---",
        "",
      ].join("\n"),
    )
    // Child references "2.spec.gamma" — slug doesn't match either duplicate
    writeFileSync(
      join(featDir, "003.task.child.md"),
      [
        "---",
        "parent: 2.spec.gamma",
        "title: Child task",
        "status: new",
        "---",
        "",
      ].join("\n"),
    )

    const project = reloadProject(dir)

    let promptCalled = false
    const mockPrompt = async (
      doc: DocumentEntry,
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
    const project = loadMutableProject(DUPE_FIXTURE)
    const plan = await buildTidyPlan(project)
    applyTidyPlan(plan)

    // Re-scan from project dir
    const newProject = reloadProject(project.projectDir)
    const newDocs = collectAllDocuments(newProject)
    const ids = newDocs.map((d) => d.id).sort((a, b) => a - b)
    expect(ids).toEqual([1, 2, 3, 4])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("preserves file content after rename", async () => {
    const project = loadMutableProject(DUPE_FIXTURE)
    const plan = await buildTidyPlan(project)
    applyTidyPlan(plan)

    const newProject = reloadProject(project.projectDir)
    const newDocs = collectAllDocuments(newProject)
    const signup = newDocs.find((d) => d.slug === "signup")
    expect(signup).toBeDefined()
    expect(signup!.id).toBe(4)

    const content = readFileSync(signup!.path, "utf-8")
    const { data } = parseFrontmatter(content)
    expect(data.title).toBe("Signup spec")
  })

  it("updates parent refs when parent ID changes", async () => {
    // Create a fixture where a child references the duplicate that will be renumbered
    const dir = workspace.dir("apply-parent-update")
    const { mkdirSync, writeFileSync } = require("node:fs")
    const featDir = join(dir, "context", "features", "001.feat.test")
    mkdirSync(featDir, { recursive: true })
    writeFileSync(
      join(dir, ".pm.json"),
      JSON.stringify({
        doctypes: { feature: { dir: "context/features" } },
      }),
    )
    writeFileSync(
      join(featDir, "001.feat.test.md"),
      ["---", "title: Test", "status: new", "---", ""].join("\n"),
    )
    writeFileSync(
      join(featDir, "002.spec.alpha.md"),
      [
        "---",
        "parent: 1.feat.test",
        "title: Alpha",
        "status: new",
        "---",
        "",
      ].join("\n"),
    )
    writeFileSync(
      join(featDir, "002.spec.beta.md"),
      [
        "---",
        "parent: 1.feat.test",
        "title: Beta",
        "status: new",
        "---",
        "",
      ].join("\n"),
    )
    // Child explicitly references beta (which will get a new ID)
    writeFileSync(
      join(featDir, "003.task.child.md"),
      [
        "---",
        "parent: 2.spec.beta",
        "title: Child",
        "status: new",
        "---",
        "",
      ].join("\n"),
    )

    const project = reloadProject(dir)
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
    const project = loadMutableProject(DUPE_FIXTURE)
    const plan1 = await buildTidyPlan(project)
    applyTidyPlan(plan1)

    const newProject = reloadProject(project.projectDir)
    const plan2 = await buildTidyPlan(newProject)
    expect(plan2.duplicateGroups.size).toBe(0)
    expect(plan2.edits).toHaveLength(0)
    expect(plan2.moves).toHaveLength(0)
    expect(plan2.orphans).toHaveLength(0)
  })
})
