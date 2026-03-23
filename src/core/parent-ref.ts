/**
 * Parent references in frontmatter use the format "{id}.{tag}.{slug}"
 * matching the filename scheme (without .md extension).
 *
 * The ID is authoritative for lookups. The tag and slug serve as hints
 * for disambiguation (e.g. when tidy encounters duplicate IDs).
 */

export type ParentRef = {
  id: number
  tag: string
  slug: string
}

const PARENT_REF_REGEX = /^(\d+)\.([a-zA-Z][a-zA-Z0-9]*)\.(.+)$/

/**
 * Format a parent reference string from components.
 */
export function formatParentRef(id: number, tag: string, slug: string): string {
  return `${id}.${tag}.${slug}`
}

/**
 * Parse a parent reference string. Returns null if the format is invalid.
 */
export function parseParentRef(ref: string): ParentRef | null {
  const match = PARENT_REF_REGEX.exec(ref)
  if (!match) return null
  return {
    id: parseInt(match[1], 10),
    tag: match[2],
    slug: match[3],
  }
}

/**
 * Extract the parent ID from a frontmatter `parent` value.
 * Accepts both the new string format ("1.feat.user-auth") and
 * legacy numeric format (1) for backwards compatibility.
 * Returns null if the value is not a valid parent reference.
 */
export function extractParentId(value: unknown): number | null {
  if (typeof value === "number" && value > 0) {
    return value
  }
  if (typeof value === "string") {
    const parsed = parseParentRef(value)
    if (parsed) return parsed.id
  }
  return null
}
