import { mkdirSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { formatFrontmatter } from "./frontmatter.js"
import { resolveProject, type ResolvedProject } from "./project.js"
import { createTestWorkspace } from "./test-workspace.js"

export type TestSetup = {
  pmJson: {
    doctypes: Record<string, unknown>
    idMask?: string
  }
  pmCurrent?: number
  files: Record<string, Record<string, unknown>>
}

export type TestProject = {
  dir: string
  project: ResolvedProject
}

/**
 * Create a test workspace that supports declarative project setup.
 * Each call to `setup()` creates a fresh temporary directory with
 * `.pm.json`, optional `.pm.current`, and all declared files.
 */
export function createTestProject(label: string) {
  const workspace = createTestWorkspace(label)

  return {
    ...workspace,

    setup(config: TestSetup): TestProject {
      const dir = workspace.dir()

      // Write .pm.json
      const pmJson = {
        ...config.pmJson,
        doctypes: config.pmJson.doctypes,
      }
      writeFileSync(join(dir, ".pm.json"), JSON.stringify(pmJson, null, 2))

      // Write .pm.current
      if (config.pmCurrent != null) {
        writeFileSync(join(dir, ".pm.current"), String(config.pmCurrent))
      }

      // Write document files
      for (const [relPath, frontmatter] of Object.entries(config.files)) {
        const absPath = join(dir, relPath)
        mkdirSync(dirname(absPath), { recursive: true })
        writeFileSync(absPath, formatFrontmatter(frontmatter))
      }

      const project = resolveProject(
        pmJson as Record<string, unknown>,
        join(dir, ".pm.json"),
      )

      return { dir, project }
    },
  }
}
