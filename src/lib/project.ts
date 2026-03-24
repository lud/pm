import { accessSync, constants } from "node:fs"
import { dirname, isAbsolute, join } from "node:path"
import { z } from "zod"
import { abortError } from "./cli.js"
import { readFileSyncOrAbort } from "./fs-helpers.js"

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
  blockedStatuses: z.array(z.string()).default(["blocked"]),
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
  formatId: (id: number) => string
}

// ---------------------------------------------------------------------------
// Validation
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

  // Parse through schema (strips $schema, applies field defaults)
  let config: ProjectConfig
  try {
    config = ProjectConfigSchema.parse(rawConfig)
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

  const idPadWidth = config.idMask.length
  return {
    projectFile,
    projectDir,
    idPadWidth,
    doctypes: resolved,
    formatId: (id: number) => String(id).padStart(idPadWidth, "0"),
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
