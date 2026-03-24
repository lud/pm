import { describe, it, expect, vi } from "vitest"
import { join } from "node:path"
import {
  resolveProject,
  locateProjectFile,
  loadProjectFile,
} from "./project.js"
import { createTestWorkspace } from "./test-workspace.js"

// Mock cli.ts so abortError throws instead of calling process.exit
vi.mock("./cli.js", async () => {
  const actual = (await vi.importActual("./cli.js")) as Record<string, unknown>
  return {
    ...actual,
    abortError: vi.fn((msg: string) => {
      throw new Error(msg)
    }),
  }
})

const workspace = createTestWorkspace("project")

function resolve(
  rawConfig: Record<string, unknown>,
  projectDir = "/test/project",
) {
  return resolveProject(rawConfig, `${projectDir}/.pm.json`)
}

const FULL_DOCTYPES = {
  feature: { tag: "feat", dir: "context/features", intermediateDir: true },
  spec: { tag: "spec", dir: ".", parent: "feature" },
  task: { tag: "task", dir: ".", parent: "spec" },
}

describe("resolveProject", () => {
  describe("no default doctypes", () => {
    it("uses only explicitly defined doctypes", () => {
      const project = resolve({
        doctypes: {
          feature: { tag: "feat", dir: "features" },
        },
      })
      expect(Object.keys(project.doctypes)).toEqual(["feature"])
    })

    it("empty doctypes yields empty project", () => {
      const project = resolve({ doctypes: {} })
      expect(Object.keys(project.doctypes)).toEqual([])
    })
  })

  describe("path resolution", () => {
    it("resolves dir to absolute path from projectDir", () => {
      const project = resolve(
        { doctypes: { feature: { tag: "feat", dir: "context/features" } } },
        "/home/user/myproject",
      )
      expect(project.projectDir).toBe("/home/user/myproject")
      expect(project.doctypes.feature.absDir).toBe(
        "/home/user/myproject/context/features",
      )
    })

    it("resolves '.' dir relative to projectDir", () => {
      const project = resolve(
        {
          doctypes: {
            feature: { tag: "feat", dir: "features" },
            spec: { tag: "spec", dir: ".", parent: "feature" },
          },
        },
        "/home/user/myproject",
      )
      expect(project.doctypes.spec.absDir).toBe("/home/user/myproject")
    })
  })

  describe("$schema handling", () => {
    it("strips $schema from config", () => {
      const project = resolve({
        $schema: "https://example.com/schema.json",
        doctypes: { feature: { tag: "feat", dir: "features" } },
      })
      // Should not throw, $schema is ignored
      expect(project.doctypes.feature).toBeDefined()
    })
  })

  describe("validation", () => {
    it("rejects duplicate tags", () => {
      expect(() =>
        resolve({
          doctypes: {
            feature: { tag: "feat", dir: "features" },
            custom: { tag: "feat", dir: "custom" },
          },
        }),
      ).toThrow(/Duplicate doctype tag "feat"/)
    })

    it("rejects parent referencing non-existent doctype", () => {
      expect(() =>
        resolve({
          doctypes: {
            feature: { tag: "feat", dir: "features" },
            custom: { tag: "cust", dir: ".", parent: "nonexistent" },
          },
        }),
      ).toThrow(/parent "nonexistent" which does not exist/)
    })

    it("rejects circular parent references", () => {
      expect(() =>
        resolve({
          doctypes: {
            a: { tag: "aa", dir: "a", parent: "b" },
            b: { tag: "bb", dir: "b", parent: "a" },
          },
        }),
      ).toThrow(/Circular parent reference/)
    })

    it("rejects absolute dir", () => {
      expect(() =>
        resolve({
          doctypes: {
            feature: { tag: "feat", dir: "/absolute/path" },
          },
        }),
      ).toThrow(/dir must be relative/)
    })

    it("rejects dir with ..", () => {
      expect(() =>
        resolve({
          doctypes: {
            feature: { tag: "feat", dir: "../escape" },
          },
        }),
      ).toThrow(/must not contain "\.\."/)
    })
  })

  describe("custom doctypes", () => {
    it("supports user-defined doctypes", () => {
      const project = resolve({
        doctypes: {
          feature: { tag: "feat", dir: "features" },
          note: { tag: "note", dir: "notes" },
        },
      })
      expect(project.doctypes.note).toBeDefined()
      expect(project.doctypes.note.tag).toBe("note")
      expect(project.doctypes.note.absDir).toBe("/test/project/notes")
      expect(project.doctypes.feature).toBeDefined()
    })
  })

  describe("default field values", () => {
    it("applies default doneStatuses", () => {
      const project = resolve({
        doctypes: {
          custom: { tag: "cust", dir: "stuff" },
        },
      })
      expect(project.doctypes.custom.doneStatuses).toEqual(["done"])
    })

    it("applies default status", () => {
      const project = resolve({
        doctypes: {
          custom: { tag: "cust", dir: "stuff" },
        },
      })
      expect(project.doctypes.custom.defaultStatus).toBe("new")
    })

    it("applies requireParent default", () => {
      const project = resolve({
        doctypes: {
          feature: { tag: "feat", dir: "features" },
        },
      })
      expect(project.doctypes.feature.requireParent).toBe(true)
    })
  })
})

// ---------------------------------------------------------------------------
// locateProjectFile
// ---------------------------------------------------------------------------

describe("locateProjectFile", () => {
  it("finds .pm.json in the given directory", () => {
    const dir = workspace.dir("locate-direct")
    const { writeFileSync } = require("node:fs")
    writeFileSync(join(dir, ".pm.json"), "{}")
    expect(locateProjectFile(dir)).toBe(join(dir, ".pm.json"))
  })

  it("walks up to find .pm.json", () => {
    const dir = workspace.dir("locate-parent")
    const subdir = join(dir, "sub", "deep")
    const { mkdirSync, writeFileSync } = require("node:fs")
    mkdirSync(subdir, { recursive: true })
    writeFileSync(join(dir, ".pm.json"), "{}")
    expect(locateProjectFile(subdir)).toBe(join(dir, ".pm.json"))
  })

  it("aborts when .pm.json is not found", () => {
    expect(() =>
      locateProjectFile("/tmp/pm-test-nonexistent-" + Date.now()),
    ).toThrow(/Could not locate .pm.json/)
  })
})

// ---------------------------------------------------------------------------
// loadProjectFile
// ---------------------------------------------------------------------------

describe("loadProjectFile", () => {
  it("loads and resolves a valid project file", () => {
    const dir = workspace.dir("load-valid")
    const { writeFileSync } = require("node:fs")
    const configPath = join(dir, ".pm.json")
    writeFileSync(
      configPath,
      JSON.stringify({
        doctypes: { feature: { tag: "feat", dir: "features" } },
      }),
    )
    const project = loadProjectFile(configPath)
    expect(project.doctypes.feature.tag).toBe("feat")
    expect(project.projectDir).toBe(dir)
  })

  it("aborts on invalid JSON", () => {
    const dir = workspace.dir("load-invalid-json")
    const { writeFileSync } = require("node:fs")
    const configPath = join(dir, ".pm.json")
    writeFileSync(configPath, "not json {{{")
    expect(() => loadProjectFile(configPath)).toThrow(/Invalid JSON/)
  })

  it("aborts on invalid config (validation error)", () => {
    const dir = workspace.dir("load-invalid-config")
    const { writeFileSync } = require("node:fs")
    const configPath = join(dir, ".pm.json")
    writeFileSync(
      configPath,
      JSON.stringify({
        doctypes: { feature: { tag: "feat", dir: "/absolute" } },
      }),
    )
    expect(() => loadProjectFile(configPath)).toThrow(/dir must be relative/)
  })
})
