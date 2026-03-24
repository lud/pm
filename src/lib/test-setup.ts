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

/**
 * Remove leading indentation from a template literal string.
 * Strips the first empty line and trailing whitespace,
 * then removes the common leading whitespace from all lines.
 */
export function dedent(text: string): string {
  // Remove leading newline
  const stripped = text.replace(/^\n/, "")
  const lines = stripped.split("\n")
  // Remove trailing empty lines
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop()
  }
  // Find minimum indentation (ignoring empty lines)
  const indents = lines
    .filter((l) => l.trim().length > 0)
    .map((l) => l.match(/^(\s*)/)![1].length)
  const minIndent = indents.length > 0 ? Math.min(...indents) : 0
  return lines.map((l) => l.slice(minIndent)).join("\n")
}
