import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { createTestProject } from "../lib/test-setup.js"
import {
  findNodeById,
  formatDocFilename,
  maxNodeId,
  scanNodes,
} from "./nodes.js"

const testProject = createTestProject("nodes")

const PM_JSON = {
  directory: "docs",
  types: { feature: { tag: "feat" }, task: { tag: "task" } },
}

describe("scanNodes", () => {
  it("finds documents at the root of the directory, any tag", () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/001.feat.auth.md": { title: "Auth", status: "new" },
        "docs/002.task.cleanup.md": { title: "Cleanup", status: "new" },
        "docs/003.wildtag.mystery.md": { title: "Mystery", status: "new" },
      },
    })
    const scan = scanNodes(project)
    expect(scan.docs.map((d) => [d.id, d.tag, d.slug, d.groupId])).toEqual([
      [1, "feat", "auth", null],
      [2, "task", "cleanup", null],
      [3, "wildtag", "mystery", null],
    ])
    expect(scan.groups).toEqual([])
    expect(scan.warnings).toEqual([])
  })

  it("recognizes group directories and scans the files inside", () => {
    const { project, dir } = testProject.setup({
      pmJson: PM_JSON,
      dirs: ["docs/004.empty-group"],
      files: {
        "docs/010.stuff/011.task.first.md": { title: "First", status: "new" },
        "docs/010.stuff/012.task.second.md": { title: "Second", status: "new" },
      },
    })
    const scan = scanNodes(project)
    expect(scan.groups.map((g) => [g.id, g.slug, g.legacyTag])).toEqual([
      [4, "empty-group", null],
      [10, "stuff", null],
    ])
    expect(scan.docs.map((d) => [d.id, d.groupId])).toEqual([
      [11, 10],
      [12, 10],
    ])
    expect(scan.groups[1].path).toBe(join(dir, "docs/010.stuff"))
  })

  it("recognizes legacy {id}.{tag}.{slug} directories as groups", () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/001.feat.auth/001.feat.auth.md": { title: "Auth", status: "new" },
        "docs/001.feat.auth/002.task.login.md": {
          parent: "1.feat.auth",
          title: "Login",
          status: "new",
        },
      },
    })
    const scan = scanNodes(project)
    expect(scan.groups).toHaveLength(1)
    expect(scan.groups[0]).toMatchObject({
      id: 1,
      slug: "auth",
      legacyTag: "feat",
    })
    expect(scan.docs.map((d) => [d.id, d.groupId])).toEqual([
      [1, 1],
      [2, 1],
    ])
  })

  it("never enters unmanaged directories", () => {
    const { project, dir } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/001.feat.real.md": { title: "Real", status: "new" },
      },
    })
    // A node_modules planted inside the root, full of doc-like files
    const nm = join(dir, "docs", "node_modules", "some-pkg")
    mkdirSync(nm, { recursive: true })
    writeFileSync(join(nm, "005.feat.evil.md"), "---\ntitle: Evil\n---\n")
    const plain = join(dir, "docs", "notes")
    mkdirSync(plain, { recursive: true })
    writeFileSync(join(plain, "006.feat.hidden.md"), "---\ntitle: H\n---\n")

    const scan = scanNodes(project)
    expect(scan.docs.map((d) => d.id)).toEqual([1])
    expect(scan.groups).toEqual([])
    expect(scan.warnings).toEqual([])
  })

  it("does not recurse into pattern-matching dirs inside groups, but warns", () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      dirs: ["docs/010.stuff/020.nested-group"],
      files: {
        "docs/010.stuff/011.task.a.md": { title: "A", status: "new" },
      },
    })
    const scan = scanNodes(project)
    expect(scan.groups.map((g) => g.id)).toEqual([10])
    expect(scan.docs.map((d) => d.id)).toEqual([11])
    expect(scan.warnings.join("\n")).toMatch(
      /020\.nested-group.*groups cannot contain groups/,
    )
  })

  it("silently ignores unrelated dirs inside groups", () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      dirs: ["docs/010.stuff/assets"],
      files: {
        "docs/010.stuff/011.task.a.md": { title: "A", status: "new" },
      },
    })
    const scan = scanNodes(project)
    expect(scan.warnings).toEqual([])
  })

  it("ignores non-document files, warning only on doc-like names", () => {
    const { project, dir } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/001.feat.real.md": { title: "Real", status: "new" },
      },
    })
    writeFileSync(join(dir, "docs", "README.md"), "# hello")
    writeFileSync(join(dir, "docs", "12.foo.md"), "---\ntitle: X\n---\n")
    writeFileSync(join(dir, "docs", "notes.txt"), "notes")

    const scan = scanNodes(project)
    expect(scan.docs.map((d) => d.id)).toEqual([1])
    expect(scan.warnings).toHaveLength(1)
    expect(scan.warnings[0]).toMatch(
      /12\.foo\.md.*does not match \{id\}\.\{tag\}\.\{slug\}\.md/,
    )
  })

  it("throws a clear error when the root directory does not exist", () => {
    const { project } = testProject.setup({
      pmJson: { ...PM_JSON, directory: "missing" },
    })
    expect(() => scanNodes(project)).toThrow(
      /Root directory not found: .*missing.*check "directory"/,
    )
  })

  it("returns nodes sorted by path", () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/010.feat.zebra.md": { title: "Z", status: "new" },
        "docs/002.feat.alpha.md": { title: "A", status: "new" },
      },
    })
    const scan = scanNodes(project)
    expect(scan.docs.map((d) => d.slug)).toEqual(["alpha", "zebra"])
  })
})

describe("findNodeById", () => {
  it("prefers the doc when a doc and a group share an ID", () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/001.feat.auth/001.feat.auth.md": { title: "Auth", status: "new" },
      },
    })
    const scan = scanNodes(project)
    const node = findNodeById(scan, 1)
    expect(node?.kind).toBe("doc")
  })

  it("finds groups by ID and returns null for unknown IDs", () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      dirs: ["docs/007.backlog"],
    })
    const scan = scanNodes(project)
    expect(findNodeById(scan, 7)?.kind).toBe("group")
    expect(findNodeById(scan, 99)).toBeNull()
  })
})

describe("maxNodeId", () => {
  it("spans docs and groups, 0 when empty", () => {
    const { project } = testProject.setup({
      pmJson: PM_JSON,
      dirs: ["docs/042.big-group"],
      files: {
        "docs/003.feat.small.md": { title: "S", status: "new" },
      },
    })
    expect(maxNodeId(scanNodes(project))).toBe(42)

    const empty = testProject.setup({ pmJson: PM_JSON, dirs: ["docs"] })
    expect(maxNodeId(scanNodes(empty.project))).toBe(0)
  })
})

describe("formatDocFilename", () => {
  it("formats with padding via formatId", () => {
    const pad3 = (id: number) => String(id).padStart(3, "0")
    expect(formatDocFilename(7, "feat", "auth", pad3)).toBe("007.feat.auth.md")
    expect(formatDocFilename(7, "feat", "auth")).toBe("7.feat.auth.md")
  })
})
