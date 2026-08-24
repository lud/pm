import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { createTestWorkspace } from "../lib/test-workspace.js"
import {
  findType,
  loadProjectFile,
  loadProjectFrom,
  resolveConfig,
  StrictProjectConfigSchema,
} from "./config.js"

const workspace = createTestWorkspace("config")

function resolve(
  rawConfig: Record<string, unknown>,
  projectDir = "/test/project",
) {
  return resolveConfig(rawConfig, `${projectDir}/pm.json`)
}

const BASE = {
  directory: "docs",
  types: {
    feature: { tag: "feat" },
    task: { tag: "task" },
  },
}

describe("resolveConfig", () => {
  describe("directory", () => {
    it("is required — missing is a hard error with a copy-paste hint", () => {
      expect(() => resolve({ types: {} })).toThrow(
        /Missing required "directory".*"directory": "context\/features"/,
      )
    })

    it("rejects an empty string", () => {
      expect(() => resolve({ directory: "  " })).toThrow(
        /Missing required "directory"/,
      )
    })

    it("resolves a relative directory from the pm.json location", () => {
      const project = resolve(BASE, "/home/user/myproject")
      expect(project.directory).toBe("docs")
      expect(project.rootDir).toBe("/home/user/myproject/docs")
      expect(project.projectDir).toBe("/home/user/myproject")
    })

    it("keeps an absolute directory as-is", () => {
      const project = resolve({ ...BASE, directory: "/srv/docs" })
      expect(project.rootDir).toBe("/srv/docs")
    })
  })

  describe("types", () => {
    it("resolves declared types with name and tag", () => {
      const project = resolve(BASE)
      expect(Object.keys(project.types)).toEqual(["feature", "task"])
      expect(project.types.feature.tag).toBe("feat")
      expect(project.types.feature.name).toBe("feature")
    })

    it("allows an empty or absent types record", () => {
      expect(resolve({ directory: "docs" }).types).toEqual({})
      expect(resolve({ directory: "docs", types: {} }).types).toEqual({})
    })

    it("rejects a tag not usable in filenames", () => {
      expect(() =>
        resolve({ directory: "docs", types: { a: { tag: "no.dots" } } }),
      ).toThrow(/invalid tag/)
    })
  })

  describe("shared name/tag namespace", () => {
    it("rejects two types with the same tag", () => {
      expect(() =>
        resolve({
          directory: "docs",
          types: { feature: { tag: "feat" }, custom: { tag: "feat" } },
        }),
      ).toThrow(/collision: "feat".*"feature".*"custom"/)
    })

    it("rejects a tag colliding with another type's name", () => {
      expect(() =>
        resolve({
          directory: "docs",
          types: { spec: { tag: "spec" }, other: { tag: "spec" } },
        }),
      ).toThrow(/collision/)
    })

    it("accepts a tag equal to its own type name", () => {
      const project = resolve({
        directory: "docs",
        types: { spec: { tag: "spec" } },
      })
      expect(project.types.spec.tag).toBe("spec")
    })
  })

  describe("findType", () => {
    it("finds a type by name or by tag", () => {
      const project = resolve(BASE)
      expect(findType(project, "feature")?.tag).toBe("feat")
      expect(findType(project, "feat")?.name).toBe("feature")
      expect(findType(project, "nope")).toBeNull()
    })
  })

  describe("statuses", () => {
    it("applies global defaults", () => {
      const project = resolve(BASE)
      expect(project.statuses).toEqual({
        defaultStatus: "new",
        doneStatuses: ["done"],
        blockedStatuses: ["blocked"],
      })
      expect(project.types.feature.defaultStatus).toBe("new")
      expect(project.types.feature.doneStatuses).toEqual(["done"])
      expect(project.types.feature.blockedStatuses).toEqual(["blocked"])
    })

    it("global config overrides the defaults for all types", () => {
      const project = resolve({
        ...BASE,
        defaultStatus: "draft",
        doneStatuses: ["done", "shipped"],
      })
      expect(project.types.task.defaultStatus).toBe("draft")
      expect(project.types.task.doneStatuses).toEqual(["done", "shipped"])
    })

    it("per-type overrides win over global config", () => {
      const project = resolve({
        directory: "docs",
        doneStatuses: ["done"],
        types: {
          decision: {
            tag: "adr",
            doneStatuses: ["accepted", "rejected", "superseded"],
          },
          task: { tag: "task" },
        },
      })
      expect(project.types.decision.doneStatuses).toEqual([
        "accepted",
        "rejected",
        "superseded",
      ])
      expect(project.types.task.doneStatuses).toEqual(["done"])
    })
  })

  describe("idMask", () => {
    it("defaults to three-digit padding", () => {
      const project = resolve(BASE)
      expect(project.idPadWidth).toBe(3)
      expect(project.formatId(7)).toBe("007")
      expect(project.formatId(1234)).toBe("1234")
    })

    it("honours a custom mask", () => {
      const project = resolve({ ...BASE, idMask: "0000" })
      expect(project.formatId(7)).toBe("0007")
    })

    it("rejects an invalid mask", () => {
      expect(() => resolve({ ...BASE, idMask: "abc" })).toThrow(
        /Invalid project config/,
      )
    })
  })

  describe("legacy handling", () => {
    it("reads legacy doctypes as types, with a warning", () => {
      const project = resolve({
        directory: "docs",
        doctypes: {
          feature: { tag: "feat", dir: "context/features" },
          spec: { tag: "spec", dir: ".", parent: "feature" },
        },
      })
      expect(Object.keys(project.types)).toEqual(["feature", "spec"])
      expect(project.types.spec.tag).toBe("spec")
      expect(project.warnings.join("\n")).toMatch(
        /Legacy "doctypes".*read as "types"/,
      )
    })

    it("carries status fields over from legacy doctypes", () => {
      const project = resolve({
        directory: "docs",
        doctypes: {
          feature: { tag: "feat", dir: ".", doneStatuses: ["shipped"] },
        },
      })
      expect(project.types.feature.doneStatuses).toEqual(["shipped"])
    })

    it("warns that structural doctype fields are ignored", () => {
      const project = resolve({
        directory: "docs",
        types: {
          feature: {
            tag: "feat",
            dir: "context/features",
            requireParent: true,
            intermediateDir: true,
          },
        },
      })
      const combined = project.warnings.join("\n")
      expect(combined).toMatch(
        /Type "feature": legacy field\(s\) "dir", "requireParent", "intermediateDir" are ignored/,
      )
    })

    it("prefers types over doctypes when both are present, with a warning", () => {
      const project = resolve({
        directory: "docs",
        types: { note: { tag: "note" } },
        doctypes: { feature: { tag: "feat", dir: "." } },
      })
      expect(Object.keys(project.types)).toEqual(["note"])
      expect(project.warnings.join("\n")).toMatch(
        /Both "types" and "doctypes".*"doctypes" is ignored/,
      )
    })

    it("warns on unknown top-level and type-level keys", () => {
      const project = resolve({
        ...BASE,
        diectory: "typo",
        types: { feature: { tag: "feat", colour: "red" } },
      })
      const combined = project.warnings.join("\n")
      expect(combined).toMatch(/Unknown key "diectory"/)
      expect(combined).toMatch(/Type "feature": unknown key "colour"/)
    })

    it("loads a full real-world v1 config with warnings only", () => {
      const project = resolve({
        $schema: "https://example.com/pm-project.schema.json",
        idMask: "000",
        doctypes: {
          feature: {
            tag: "feat",
            dir: "context/features",
            intermediateDir: true,
          },
          spec: { tag: "spec", dir: ".", parent: "feature" },
          task: { tag: "task", dir: ".", parent: "spec", requireParent: true },
        },
        directory: "context/features",
      })
      expect(Object.keys(project.types)).toEqual(["feature", "spec", "task"])
      expect(project.rootDir).toBe("/test/project/context/features")
      expect(project.warnings.length).toBeGreaterThan(0)
    })

    it("strict schema rejects legacy shapes that the loader only warns on", () => {
      const legacy = {
        directory: "docs",
        doctypes: { feature: { tag: "feat", dir: "." } },
      }
      expect(StrictProjectConfigSchema.safeParse(legacy).success).toBe(false)
      expect(() => resolve(legacy)).not.toThrow()

      const clean = { directory: "docs", types: { task: { tag: "task" } } }
      expect(StrictProjectConfigSchema.safeParse(clean).success).toBe(true)
    })

    it("accepts per-type guide keys without warnings, resolved onto the type", () => {
      const project = resolve({
        directory: "docs",
        types: {
          feature: { tag: "feat", guide: "guides/feature.md" },
          task: { tag: "task", guide: false },
          note: { tag: "note" },
        },
      })
      expect(project.warnings).toEqual([])
      expect(project.types.feature.guide).toBe("guides/feature.md")
      expect(project.types.task.guide).toBe(false)
      expect(project.types.note.guide).toBeUndefined()
    })

    it("produces no warnings for a clean v2 config", () => {
      const project = resolve({
        $schema: "https://example.com/schema.json",
        ...BASE,
      })
      expect(project.warnings).toEqual([])
    })
  })
})

// ---------------------------------------------------------------------------
// Loading from disk
// ---------------------------------------------------------------------------

describe("loadProjectFile", () => {
  it("loads and resolves a valid project file", () => {
    const dir = workspace.dir("load-valid")
    const configPath = join(dir, "pm.json")
    writeFileSync(
      configPath,
      JSON.stringify({ directory: "docs", types: { task: { tag: "task" } } }),
    )
    const project = loadProjectFile(configPath)
    expect(project.projectDir).toBe(dir)
    expect(project.rootDir).toBe(join(dir, "docs"))
  })

  it("throws on invalid JSON", () => {
    const dir = workspace.dir("load-bad-json")
    const configPath = join(dir, "pm.json")
    writeFileSync(configPath, "not json {{{")
    expect(() => loadProjectFile(configPath)).toThrow(/Invalid JSON/)
  })

  it("throws on an unreadable file", () => {
    expect(() => loadProjectFile("/nonexistent/pm.json")).toThrow(
      /read file: not found/,
    )
  })
})

describe("PMFILE override", () => {
  it("locates and loads the overridden file name, ignoring pm.json", () => {
    const dir = workspace.dir("pmfile")
    writeFileSync(
      join(dir, "pm.json"),
      JSON.stringify({ directory: "regular" }),
    )
    writeFileSync(
      join(dir, "pm-dev.json"),
      JSON.stringify({ directory: "dev" }),
    )

    vi.stubEnv("PMFILE", "pm-dev.json")
    try {
      const project = loadProjectFrom(dir)
      expect(project.directory).toBe("dev")
      expect(project.projectFile).toBe(join(dir, "pm-dev.json"))
    } finally {
      vi.unstubAllEnvs()
    }

    expect(loadProjectFrom(dir).directory).toBe("regular")
  })

  it("does not find the default file while the override is active", () => {
    const dir = workspace.dir("pmfile-missing")
    writeFileSync(
      join(dir, "pm.json"),
      JSON.stringify({ directory: "regular" }),
    )
    vi.stubEnv("PMFILE", "pm-dev.json")
    try {
      expect(() => loadProjectFrom(dir)).toThrow(
        /Could not locate pm-dev\.json/,
      )
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

describe("loadProjectFrom", () => {
  it("walks up to find pm.json", () => {
    const dir = workspace.dir("walk-up")
    const deep = join(dir, "sub", "deep")
    mkdirSync(deep, { recursive: true })
    writeFileSync(join(dir, "pm.json"), JSON.stringify({ directory: "docs" }))
    const project = loadProjectFrom(deep)
    expect(project.projectDir).toBe(dir)
  })

  it("throws when no pm.json exists up the tree", () => {
    expect(() => loadProjectFrom("/nonexistent/nowhere")).toThrow(
      /Could not locate pm.json/,
    )
  })
})
