import { existsSync } from "node:fs"
import { isAbsolute, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseFrontmatter } from "../lib/frontmatter.js"
import { readFileSyncOrThrow } from "../lib/fs-helpers.js"
import type { ResolvedProject, ResolvedType } from "./config.js"

/**
 * Type guides. A guide is a skill-like markdown
 * document teaching how to use one type; its frontmatter `description`
 * is the one-liner `pm info` shows, and `pm new` prints the guide path
 * on success so the agent's natural next move is reading it.
 *
 * Resolution per type:
 *  - `guide` is a string  → path relative to the project dir (or
 *    absolute); MUST resolve — explicit intent fails loudly.
 *  - `guide` is false     → no guide (disables the built-in).
 *  - `guide` absent       → built-in lookup by type NAME under
 *    resources/type-guides/ in the pm installation; silently skipped
 *    when the name is unmapped or the file is missing.
 */

export type ResolvedGuide = {
  path: string
  description: string | null
}

const BUILTIN_GUIDES: Record<string, string> = {
  feature: "feature.md",
  spec: "spec.md",
  task: "task.md",
  adr: "adr.md",
  note: "note.md",
}

function builtinGuidesDir(): string {
  return fileURLToPath(new URL("../../resources/type-guides/", import.meta.url))
}

export function resolveGuide(
  project: ResolvedProject,
  type: ResolvedType,
): ResolvedGuide | null {
  if (type.guide === false) return null

  let path: string
  if (typeof type.guide === "string") {
    path = isAbsolute(type.guide)
      ? type.guide
      : join(project.projectDir, type.guide)
    if (!existsSync(path)) {
      throw new Error(`Guide for type "${type.name}" not found: ${path}`)
    }
  } else {
    const fileName = BUILTIN_GUIDES[type.name]
    if (fileName === undefined) return null
    path = join(builtinGuidesDir(), fileName)
    if (!existsSync(path)) return null
  }

  return { path, description: readDescription(path) }
}

function readDescription(path: string): string | null {
  const { data } = parseFrontmatter(readFileSyncOrThrow(path, "utf-8"))
  return typeof data.description === "string" ? data.description : null
}
