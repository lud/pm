import { mkdirSync, writeFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { formatFrontmatter } from "./frontmatter.js"
import { type ResolvedProject, resolveProject } from "./project.js"
import { createTestWorkspace } from "./test-workspace.js"

export type TestFileData = Record<string, unknown> & {
  children?: Record<string, TestFileData>
}

export type TestSetup = {
  pmJson: {
    doctypes: Record<string, unknown>
    idMask?: string
  }
  pmCurrent?: number
  files: Record<string, TestFileData>
}

function flattenFiles(
  files: Record<string, TestFileData>,
  parentId: number | undefined,
  acc: Record<string, Record<string, unknown>>,
): void {
  for (const [path, entry] of Object.entries(files)) {
    const { children, ...frontmatter } = entry

    if (parentId !== undefined && !("parent" in frontmatter)) {
      frontmatter.parent = parentId
    }
    acc[path] = frontmatter

    if (children) {
      const idStr = basename(path).match(/^0*(\d+)\./)?.[1]
      const id = idStr !== undefined ? parseInt(idStr, 10) : undefined
      flattenFiles(children, id, acc)
    }
  }
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
      const flat: Record<string, Record<string, unknown>> = {}
      flattenFiles(config.files, undefined, flat)
      for (const [relPath, frontmatter] of Object.entries(flat)) {
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
