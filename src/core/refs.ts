/**
 * Node references in frontmatter.
 *
 * A `parent:` or `depends:` entry may reference:
 *   - a document: "{id}.{tag}.{slug}" — matching the filename scheme
 *   - a group:    "{id}.{slug}"       — matching the directory name
 *   - a bare ID:  12 (number) or "12" — shorthand, normalized by tidy
 *
 * The ID is authoritative for lookups. Everything else — tag, slug, and
 * the parsed `kind` itself — is a hint about the ref's *form*, not truth
 * about the node: during migration an ID can name a legacy directory
 * whose name has doc form (`012.feat.foo/`). Consumers must resolve the
 * ID against the scanned node set and check what the node is. Two
 * dot-separated parts after the ID means doc form, one part means group
 * form — unambiguous because generated slugs never contain dots (a doc
 * slug may, for legacy files, via the greedy tail of the doc regex).
 */

export type DocRef = { kind: "doc"; id: number; tag: string; slug: string }
export type GroupRef = { kind: "group"; id: number; slug: string }
export type NodeRef = DocRef | GroupRef

const DOC_REF_REGEX = /^(\d+)\.([a-zA-Z][a-zA-Z0-9]*)\.(.+)$/
const GROUP_REF_REGEX = /^(\d+)\.([^.]+)$/

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Pass the project's `formatId` so the ID is rendered with the same
 * zero-padding as filenames; defaults to no padding when omitted.
 */
export function formatDocRef(
  id: number,
  tag: string,
  slug: string,
  formatId: (id: number) => string = String,
): string {
  return `${formatId(id)}.${tag}.${slug}`
}

export function formatGroupRef(
  id: number,
  slug: string,
  formatId: (id: number) => string = String,
): string {
  return `${formatId(id)}.${slug}`
}

export function formatRef(
  ref: NodeRef,
  formatId: (id: number) => string = String,
): string {
  return ref.kind === "doc"
    ? formatDocRef(ref.id, ref.tag, ref.slug, formatId)
    : formatGroupRef(ref.id, ref.slug, formatId)
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** Parse a qualified node reference string. Bare IDs are not accepted
 * here — use `parseRefId` for values that may be bare. */
export function parseNodeRef(ref: string): NodeRef | null {
  const doc = DOC_REF_REGEX.exec(ref)
  if (doc) {
    return {
      kind: "doc",
      id: parseInt(doc[1], 10),
      tag: doc[2],
      slug: doc[3],
    }
  }
  const group = GROUP_REF_REGEX.exec(ref)
  if (group) {
    return {
      kind: "group",
      id: parseInt(group[1], 10),
      slug: group[2],
    }
  }
  return null
}

/**
 * Extract the node ID from a frontmatter reference value: a positive
 * integer, a bare numeric string, or a qualified doc/group ref.
 * Returns null for anything else.
 */
export function parseRefId(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : null
  }
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (/^\d+$/.test(trimmed)) {
      const id = parseInt(trimmed, 10)
      return id > 0 ? id : null
    }
    const parsed = parseNodeRef(trimmed)
    if (parsed) return parsed.id
  }
  return null
}

// ---------------------------------------------------------------------------
// depends:
// ---------------------------------------------------------------------------

export type DependsEntry = {
  /** The raw frontmatter value, preserved for warnings and rewrites. */
  raw: unknown
  /** Resolved node ID, or null when the entry is malformed. */
  id: number | null
  /** The qualified ref when the entry was one, for hint inspection. */
  ref: NodeRef | null
}

/**
 * Parse a frontmatter `depends` value into entries. A scalar is treated
 * as a single-entry list; absent or unusable values yield an empty list.
 * Whether an ID points at a doc, a group (rejected — warn and ignore),
 * or nothing is the consumer's job: it requires the scanned node set,
 * not the ref text.
 */
export function parseDepends(value: unknown): DependsEntry[] {
  if (value === undefined || value === null) return []
  const list = Array.isArray(value) ? value : [value]
  return list.map((raw) => ({
    raw,
    id: parseRefId(raw),
    ref: typeof raw === "string" ? parseNodeRef(raw.trim()) : null,
  }))
}
