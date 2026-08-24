import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { createTestProject } from "../lib/test-setup.js"
import { resolveGuide } from "./guides.js"

const testProject = createTestProject("guides")

describe("resolveGuide", () => {
  it("resolves an explicit relative path and reads the description", () => {
    const { project, dir } = testProject.setup({
      pmJson: {
        directory: "docs",
        types: { feature: { tag: "feat", guide: "guides/feature.md" } },
      },
      dirs: ["docs", "guides"],
    })
    writeFileSync(
      join(dir, "guides/feature.md"),
      "---\ndescription: Project-specific feature guide\n---\n\n# Guide\n",
    )
    const guide = resolveGuide(project, project.types.feature)
    expect(guide).toEqual({
      path: join(dir, "guides/feature.md"),
      description: "Project-specific feature guide",
    })
  })

  it("resolves an explicit absolute path", () => {
    const { project, dir } = testProject.setup({
      pmJson: { directory: "docs", types: { task: { tag: "task" } } },
      dirs: ["docs"],
    })
    const abs = join(dir, "elsewhere.md")
    writeFileSync(abs, "---\ndescription: Absolute\n---\n")
    const withGuide = { ...project.types.task, guide: abs }
    expect(resolveGuide(project, withGuide)?.description).toBe("Absolute")
  })

  it("throws when an explicit path does not resolve", () => {
    const { project } = testProject.setup({
      pmJson: {
        directory: "docs",
        types: { feature: { tag: "feat", guide: "missing.md" } },
      },
      dirs: ["docs"],
    })
    expect(() => resolveGuide(project, project.types.feature)).toThrow(
      /Guide for type "feature" not found: .*missing\.md/,
    )
  })

  it("returns null for guide: false, even for a built-in name", () => {
    const { project } = testProject.setup({
      pmJson: {
        directory: "docs",
        types: { feature: { tag: "feat", guide: false } },
      },
      dirs: ["docs"],
    })
    expect(resolveGuide(project, project.types.feature)).toBeNull()
  })

  it("falls back to the built-in guide by type name", () => {
    const { project } = testProject.setup({
      pmJson: { directory: "docs", types: { feature: { tag: "feat" } } },
      dirs: ["docs"],
    })
    const guide = resolveGuide(project, project.types.feature)
    expect(guide?.path).toMatch(/resources\/type-guides\/feature\.md$/)
    expect(guide?.description).toBeTruthy()
  })

  it("skips silently for names without a built-in", () => {
    const { project } = testProject.setup({
      pmJson: { directory: "docs", types: { desk: { tag: "desk" } } },
      dirs: ["docs"],
    })
    expect(resolveGuide(project, project.types.desk)).toBeNull()
  })

  it("yields a null description for a guide without frontmatter", () => {
    const { project, dir } = testProject.setup({
      pmJson: {
        directory: "docs",
        types: { note: { tag: "note", guide: "raw.md" } },
      },
      dirs: ["docs"],
    })
    writeFileSync(join(dir, "raw.md"), "# Just a body\n")
    expect(resolveGuide(project, project.types.note)?.description).toBeNull()
  })
})
