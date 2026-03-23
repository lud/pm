import { z } from "zod"
import { join, isAbsolute, dirname } from "node:path"
import { existsSync, accessSync, constants } from "node:fs"
import { merge } from "lodash-es"
import { readFileSyncOrAbort } from "./fs-helpers.js"
import { abortError } from "./cli.js"

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const DoctypeSchema = z.object({
  tag: z.string(),
  dir: z.string().default("."),
  parent: z.string().optional(),
  requireParent: z.boolean().default(true),
  intermediateDir: z.boolean().default(false),
  closedStatuses: z.array(z.string()).default(["done"]),
  defaultStatus: z.string().default("new"),
})

export type DoctypeConfig = z.infer<typeof DoctypeSchema>

const ProjectConfigSchema = z.object({
  $schema: z.string().optional(),
  doctypes: z.record(z.string(), DoctypeSchema).default({}),
})

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>

// ---------------------------------------------------------------------------
// Default doctypes
// ---------------------------------------------------------------------------

const DEFAULT_DOCTYPES: Record<string, Partial<DoctypeConfig>> = {
  feature: {
    tag: "feat",
    intermediateDir: true,
    closedStatuses: ["done"],
  },
  spec: {
    tag: "spec",
    dir: ".",
    parent: "feature",
    closedStatuses: ["specified"],
  },
  task: {
    tag: "task",
    dir: ".",
    parent: "spec",
    closedStatuses: ["done"],
  },
}

// ---------------------------------------------------------------------------
// Resolved project (absolute paths, validated)
// ---------------------------------------------------------------------------

export type ResolvedDoctype = DoctypeConfig & {
  name: string
  absDir: string
}

export type ResolvedProject = {
  projectFile: string
  projectDir: string
  doctypes: Record<string, ResolvedDoctype>
}

// ---------------------------------------------------------------------------
// Merge defaults with user config
// ---------------------------------------------------------------------------

function mergeWithDefaults(
  userDoctypes: Record<string, unknown>,
): Record<string, unknown> {
  // 1. Collect null keys (user wants to remove these defaults)
  const nullKeys = new Set<string>()
  for (const [key, value] of Object.entries(userDoctypes)) {
    if (value === null) {
      nullKeys.add(key)
    }
  }

  // 2. Build defaults minus null-removed keys
  const defaults: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(DEFAULT_DOCTYPES)) {
    if (!nullKeys.has(key)) {
      defaults[key] = { ...value }
    }
  }

  // 3. Build user config minus null entries
  const userClean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(userDoctypes)) {
    if (value !== null) {
      userClean[key] = value
    }
  }

  // 4. Deep merge
  return merge(defaults, userClean)
}

// ---------------------------------------------------------------------------
// Validation (post-merge)
// ---------------------------------------------------------------------------

function validateDoctypes(
  doctypes: Record<string, DoctypeConfig>,
): void {
  const tags = new Set<string>()

  for (const [name, dt] of Object.entries(doctypes)) {
    // Unique tags
    if (tags.has(dt.tag)) {
      abortError(`Duplicate doctype tag "${dt.tag}" in doctype "${name}"`)
    }
    tags.add(dt.tag)

    // Parent references existing doctype
    if (dt.parent !== undefined && !(dt.parent in doctypes)) {
      abortError(
        `Doctype "${name}" has parent "${dt.parent}" which does not exist`,
      )
    }

    // Top-level doctypes must have an explicit dir
    if (dt.parent === undefined && dt.dir === ".") {
      // This is allowed per spec — user may want files in project root
    }

    // No absolute paths or ..
    if (isAbsolute(dt.dir)) {
      abortError(`Doctype "${name}" dir must be relative, got "${dt.dir}"`)
    }
    if (dt.dir.includes("..")) {
      abortError(`Doctype "${name}" dir must not contain "..", got "${dt.dir}"`)
    }
  }

  // Check for circular parent references
  for (const name of Object.keys(doctypes)) {
    const visited = new Set<string>()
    let current: string | undefined = name
    while (current !== undefined) {
      if (visited.has(current)) {
        abortError(`Circular parent reference detected involving doctype "${name}"`)
      }
      visited.add(current)
      current = doctypes[current].parent
    }
  }
}

// ---------------------------------------------------------------------------
// Project loading
// ---------------------------------------------------------------------------

/**
 * Walk up from `startDir` looking for `.pm.json`.
 * Returns the absolute path to the file, or aborts with an error.
 */
export function locateProjectFile(startDir: string): string {
  let dir = startDir
  while (true) {
    const candidate = join(dir, ".pm.json")
    try {
      accessSync(candidate, constants.R_OK)
      return candidate
    } catch {
      // not found or not readable — keep walking
    }

    const parentDir = dirname(dir)
    if (parentDir === dir) {
      // Reached filesystem root
      abortError("Could not locate .pm.json: not found")
    }
    dir = parentDir
  }
}

/**
 * Load and resolve a project from a `.pm.json` file path.
 */
export function loadProjectFile(projectFile: string): ResolvedProject {
  const raw = readFileSyncOrAbort(projectFile, "utf-8")
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    abortError(`Invalid JSON in ${projectFile}`)
  }

  return resolveProject(parsed as Record<string, unknown>, projectFile)
}

/**
 * Resolve a raw config object into a ResolvedProject.
 * Useful for testing (pass config directly without reading from disk).
 */
export function resolveProject(
  rawConfig: Record<string, unknown>,
  projectFile: string,
): ResolvedProject {
  const projectDir = dirname(projectFile)

  // Merge doctypes with defaults
  const userDoctypes = (rawConfig.doctypes ?? {}) as Record<string, unknown>
  const mergedDoctypes = mergeWithDefaults(userDoctypes)

  // Parse through schema (strips $schema, applies defaults)
  const config = ProjectConfigSchema.parse({
    ...rawConfig,
    doctypes: mergedDoctypes,
  })

  // Validate
  validateDoctypes(config.doctypes)

  // Resolve to absolute paths
  const resolved: Record<string, ResolvedDoctype> = {}
  for (const [name, dt] of Object.entries(config.doctypes)) {
    resolved[name] = {
      ...dt,
      name,
      absDir: join(projectDir, dt.dir),
    }
  }

  return {
    projectFile,
    projectDir,
    doctypes: resolved,
  }
}

/**
 * Load a project starting from a working directory.
 * Walks up to find `.pm.json`, then loads and resolves it.
 */
export function loadProjectFrom(cwd: string): ResolvedProject {
  const projectFile = locateProjectFile(cwd)
  return loadProjectFile(projectFile)
}
