import { z } from "zod"
import { join, isAbsolute, dirname } from "node:path"
import { accessSync, constants } from "node:fs"
import { merge } from "lodash-es"
import { readFileSyncOrAbort } from "./fs-helpers.js"
import { abortError } from "./cli.js"

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const DoctypeSchema = z.object({
  tag: z.string(),
  dir: z.string().optional(),
  parent: z.string().optional(),
  requireParent: z.boolean().default(true),
  intermediateDir: z.boolean().default(false),
  doneStatuses: z.array(z.string()).default(["done"]),
  defaultStatus: z.string().default("new"),
})

export type DoctypeConfig = z.infer<typeof DoctypeSchema>

const IdMaskSchema = z
  .string()
  .regex(/^0{1,10}$/)
  .default("000")

export const ProjectConfigSchema = z.object({
  $schema: z.string().optional(),
  idMask: IdMaskSchema,
  doctypes: z.record(z.string(), DoctypeSchema).default({}),
})

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>

// ---------------------------------------------------------------------------
// Default doctypes
// ---------------------------------------------------------------------------

export const DEFAULT_DOCTYPES: Record<string, Partial<DoctypeConfig>> = {
  feature: {
    tag: "feat",
    intermediateDir: true,
    doneStatuses: ["done"],
  },
  spec: {
    tag: "spec",
    dir: ".",
    parent: "feature",
    doneStatuses: ["specified"],
  },
  task: {
    tag: "task",
    dir: ".",
    parent: "spec",
    doneStatuses: ["done"],
  },
}

// ---------------------------------------------------------------------------
// Resolved project (absolute paths, validated)
// ---------------------------------------------------------------------------

export type ResolvedDoctype = Omit<DoctypeConfig, "dir"> & {
  dir: string
  name: string
  absDir: string
}

export type ResolvedProject = {
  projectFile: string
  projectDir: string
  idPadWidth: number
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

function validateDoctypes(doctypes: Record<string, DoctypeConfig>): void {
  const tags = new Set<string>()

  for (const [name, dt] of Object.entries(doctypes)) {
    if (tags.has(dt.tag)) {
      throw new Error(`Duplicate doctype tag "${dt.tag}" in doctype "${name}"`)
    }
    tags.add(dt.tag)

    if (dt.parent !== undefined && !(dt.parent in doctypes)) {
      throw new Error(
        `Doctype "${name}" has parent "${dt.parent}" which does not exist`,
      )
    }

    if (dt.dir === undefined) {
      throw new Error(`Doctype "${name}" is missing required field "dir"`)
    }

    if (isAbsolute(dt.dir)) {
      throw new Error(`Doctype "${name}" dir must be relative, got "${dt.dir}"`)
    }
    if (dt.dir.includes("..")) {
      throw new Error(
        `Doctype "${name}" dir must not contain "..", got "${dt.dir}"`,
      )
    }
  }

  // Check for circular parent references
  for (const name of Object.keys(doctypes)) {
    const visited = new Set<string>()
    let current: string | undefined = name
    while (current !== undefined) {
      if (visited.has(current)) {
        throw new Error(
          `Circular parent reference detected involving doctype "${name}"`,
        )
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
 * Returns the absolute path to the file, or null if not found.
 */
export function tryLocateProjectFile(startDir: string): string | null {
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
      return null
    }
    dir = parentDir
  }
}

/**
 * Walk up from `startDir` looking for `.pm.json`.
 * Returns the absolute path to the file, or aborts with an error.
 */
export function locateProjectFile(startDir: string): string {
  const result = tryLocateProjectFile(startDir)
  if (result === null) {
    abortError("Could not locate .pm.json: not found")
  }
  return result
}

/**
 * Load and resolve a project from a `.pm.json` file path.
 * Aborts on any error (JSON parse, schema validation, etc.).
 */
export function loadProjectFile(projectFile: string): ResolvedProject {
  const raw = readFileSyncOrAbort(projectFile, "utf-8")
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    abortError(`Invalid JSON in ${projectFile}`)
  }

  try {
    return resolveProject(parsed as Record<string, unknown>, projectFile)
  } catch (err) {
    abortError((err as Error).message)
  }
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
  let config: ProjectConfig
  try {
    config = ProjectConfigSchema.parse({
      ...rawConfig,
      doctypes: mergedDoctypes,
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      const issues = err.issues.map(
        (i) => `  ${i.path.join(".")}: ${i.message}`,
      )
      throw new Error(
        `Invalid project config in ${projectFile}:\n${issues.join("\n")}`,
      )
    }
    throw err
  }

  // Validate
  validateDoctypes(config.doctypes)

  // Resolve to absolute paths
  const resolved: Record<string, ResolvedDoctype> = {}
  for (const [name, dt] of Object.entries(config.doctypes)) {
    const dir = dt.dir ?? "."
    resolved[name] = {
      ...dt,
      dir,
      name,
      absDir: join(projectDir, dir),
    }
  }

  return {
    projectFile,
    projectDir,
    idPadWidth: config.idMask.length,
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
