import { accessSync, constants } from "node:fs"
import { dirname, isAbsolute, join } from "node:path"
import { z } from "zod"
import { readFileSyncOrThrow } from "../lib/fs-helpers.js"

// ---------------------------------------------------------------------------
// Schema (flat model)
// ---------------------------------------------------------------------------

/** Tags must be usable in filenames: `{id}.{tag}.{slug}.md`. */
const TAG_REGEX = /^[a-zA-Z][a-zA-Z0-9]*$/

const TypeFields = {
  tag: z.string().regex(TAG_REGEX, "invalid tag"),
  defaultStatus: z.string().optional(),
  doneStatuses: z.array(z.string()).optional(),
  blockedStatuses: z.array(z.string()).optional(),
  /** Path to the type's guide document (relative to the project dir),
   * or false to disable the built-in guide. */
  guide: z.union([z.string(), z.literal(false)]).optional(),
}

const TypeSchema = z.looseObject(TypeFields)

export type TypeConfig = z.infer<typeof TypeSchema>

const IdMaskSchema = z
  .string()
  .regex(/^0{1,10}$/)
  .default("000")

export const ProjectConfigSchema = z.looseObject({
  $schema: z.string().optional(),
  directory: z.string().optional(),
  idMask: IdMaskSchema,
  defaultStatus: z.string().default("new"),
  doneStatuses: z.array(z.string()).default(["done"]),
  blockedStatuses: z.array(z.string()).default(["blocked"]),
  types: z.record(z.string(), TypeSchema).optional(),
  doctypes: z.record(z.string(), TypeSchema).optional(),
})

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>

/**
 * The strict v2 schema: no legacy fields, no unknown keys, `directory`
 * required. Never used to reject a config — the loader parses with the
 * tolerant schema above and runs this as a second pass whose failures
 * become warnings. This is also the schema to publish as the project's
 * JSON schema for editors.
 */
export const StrictProjectConfigSchema = z.strictObject({
  $schema: z.string().optional(),
  directory: z.string(),
  idMask: IdMaskSchema,
  defaultStatus: z.string().default("new"),
  doneStatuses: z.array(z.string()).default(["done"]),
  blockedStatuses: z.array(z.string()).default(["blocked"]),
  types: z.record(z.string(), z.strictObject(TypeFields)).optional(),
})

// ---------------------------------------------------------------------------
// Resolved project
// ---------------------------------------------------------------------------

export type StatusConfig = {
  defaultStatus: string
  doneStatuses: string[]
  blockedStatuses: string[]
}

export type ResolvedType = StatusConfig & {
  name: string
  tag: string
  guide?: string | false
}

export type ResolvedProject = {
  projectFile: string
  projectDir: string
  /** The configured root documents directory, as written in pm.json. */
  directory: string
  /** Absolute path of the root documents directory. */
  rootDir: string
  types: Record<string, ResolvedType>
  /** Global status config, applies to docs whose tag matches no type. */
  statuses: StatusConfig
  idPadWidth: number
  formatId: (id: number) => string
  warnings: string[]
}

/** Look up a type by name or tag (shared namespace). */
export function findType(
  project: ResolvedProject,
  nameOrTag: string,
): ResolvedType | null {
  for (const type of Object.values(project.types)) {
    if (type.name === nameOrTag || type.tag === nameOrTag) return type
  }
  return null
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/** Structural doctype fields from the v1 model, ignored under the flat model. */
const LEGACY_TYPE_KEYS = new Set([
  "dir",
  "parent",
  "requireParent",
  "intermediateDir",
  "workflows",
])

export function resolveConfig(
  rawConfig: Record<string, unknown>,
  projectFile: string,
): ResolvedProject {
  const projectDir = dirname(projectFile)
  const warnings: string[] = []

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

  // Root documents directory — required, no default
  if (config.directory === undefined || config.directory.trim() === "") {
    throw new Error(
      `Missing required "directory" in ${projectFile}. ` +
        `Set the root documents directory, e.g. "directory": "context/features"`,
    )
  }
  const directory = config.directory
  const rootDir = isAbsolute(directory)
    ? directory
    : join(projectDir, directory)

  // Types — prefer "types"; fall back to legacy "doctypes" with warnings
  let rawTypes: Record<string, TypeConfig>
  if (config.types !== undefined) {
    rawTypes = config.types
    if (config.doctypes !== undefined) {
      warnings.push(
        `Both "types" and "doctypes" present in ${projectFile}; ` +
          `legacy "doctypes" is ignored`,
      )
    }
  } else if (config.doctypes !== undefined) {
    rawTypes = config.doctypes
    warnings.push(
      `Legacy "doctypes" in ${projectFile} is read as "types"; ` +
        `rename it to "types" to silence this warning`,
    )
  } else {
    rawTypes = {}
  }

  const statuses: StatusConfig = {
    defaultStatus: config.defaultStatus,
    doneStatuses: config.doneStatuses,
    blockedStatuses: config.blockedStatuses,
  }

  const types: Record<string, ResolvedType> = {}
  for (const [name, tc] of Object.entries(rawTypes)) {
    const legacyKeys = Object.keys(tc).filter((k) => LEGACY_TYPE_KEYS.has(k))
    if (legacyKeys.length > 0) {
      warnings.push(
        `Type "${name}": legacy field(s) ${legacyKeys
          .map((k) => `"${k}"`)
          .join(", ")} are ignored under the flat model`,
      )
    }
    types[name] = {
      name,
      tag: tc.tag,
      defaultStatus: tc.defaultStatus ?? statuses.defaultStatus,
      doneStatuses: tc.doneStatuses ?? statuses.doneStatuses,
      blockedStatuses: tc.blockedStatuses ?? statuses.blockedStatuses,
      ...(tc.guide !== undefined ? { guide: tc.guide } : {}),
    }
  }

  validateTypeNamespace(types)

  warnings.push(...strictPassWarnings(rawConfig, projectFile))

  const idPadWidth = config.idMask.length
  return {
    projectFile,
    projectDir,
    directory,
    rootDir,
    types,
    statuses,
    idPadWidth,
    formatId: (id: number) => String(id).padStart(idPadWidth, "0"),
    warnings,
  }
}

/**
 * Second validation pass with the strict v2 schema. Failures become
 * warnings, never errors — this is how a tolerantly-loaded config still
 * surfaces every deviation from the new model. Issues already covered by
 * a tailored message are filtered out: the top-level "doctypes" key and
 * legacy structural fields inside type entries. Everything the tolerant
 * schema validates too (field types, idMask) has already thrown, so only
 * unrecognized-key issues remain relevant here.
 */
function strictPassWarnings(
  rawConfig: Record<string, unknown>,
  projectFile: string,
): string[] {
  const strict = StrictProjectConfigSchema.safeParse(rawConfig)
  if (strict.success) return []

  const warnings: string[] = []
  for (const issue of strict.error.issues) {
    if (issue.code !== "unrecognized_keys") continue
    for (const key of issue.keys) {
      if (issue.path.length === 0) {
        // already warned by the tailored "doctypes read as types" message
        if (key === "doctypes") continue
        warnings.push(`Unknown key "${key}" in ${projectFile} (ignored)`)
      } else if (issue.path.length === 2 && issue.path[0] === "types") {
        // already warned by the tailored "legacy field(s) ignored" message
        if (LEGACY_TYPE_KEYS.has(key)) continue
        warnings.push(
          `Type "${String(issue.path[1])}": unknown key "${key}" (ignored)`,
        )
      } else {
        warnings.push(
          `Unknown key "${key}" at "${issue.path.join(".")}" in ${projectFile} (ignored)`,
        )
      }
    }
  }
  return warnings
}

/**
 * Type names and tags share one lookup namespace (`pm new feat` ≡
 * `pm new feature`), so no name or tag may collide with another type's
 * name or tag. A type whose tag equals its own name is fine.
 */
function validateTypeNamespace(types: Record<string, ResolvedType>): void {
  const owners = new Map<string, string>()
  for (const type of Object.values(types)) {
    const keys = type.tag === type.name ? [type.name] : [type.name, type.tag]
    for (const key of keys) {
      const owner = owners.get(key)
      if (owner !== undefined) {
        throw new Error(
          `Type name/tag collision: "${key}" is used by both ` +
            `"${owner}" and "${type.name}"`,
        )
      }
      owners.set(key, type.name)
    }
  }
}

// ---------------------------------------------------------------------------
// Project loading (throws plain Errors — the CLI shell maps to abortError)
// ---------------------------------------------------------------------------

/**
 * The project file name. `PMFILE` overrides it (undocumented — lets pm
 * manage its own repo through e.g. `PMFILE=pm-dev.json` in .envrc
 * while tests and users keep the default).
 */
export function projectFileName(): string {
  const name = process.env.PMFILE?.trim()
  return name ? name : "pm.json"
}

/**
 * Walk up from `startDir` looking for the project file.
 * Returns the absolute path to the file, or null if not found.
 */
export function tryLocateProjectFile(startDir: string): string | null {
  const fileName = projectFileName()
  let dir = startDir
  while (true) {
    const candidate = join(dir, fileName)
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

export function loadProjectFile(projectFile: string): ResolvedProject {
  const raw = readFileSyncOrThrow(projectFile, "utf-8")

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`Invalid JSON in ${projectFile}`)
  }

  return resolveConfig(parsed as Record<string, unknown>, projectFile)
}

/**
 * Load a project starting from a working directory.
 * Walks up to find `pm.json`, then loads and resolves it.
 */
export function loadProjectFrom(cwd: string): ResolvedProject {
  const projectFile = tryLocateProjectFile(cwd)
  if (projectFile === null) {
    throw new Error(`Could not locate ${projectFileName()}: not found`)
  }
  return loadProjectFile(projectFile)
}
