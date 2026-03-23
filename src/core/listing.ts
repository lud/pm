import { readFileSync } from "node:fs"
import { parseFrontmatter } from "../lib/frontmatter.js"
import type { ResolvedProject } from "../lib/project.js"
import { collectAllDocuments, type ScannedDocument } from "./scanner.js"
import type { DocumentInfo } from "./documents.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ListFilter = {
  doctype?: string
  parentId?: number
  status?: string
  open?: boolean
  closed?: boolean
}

export type ListEntry = {
  id: number
  tag: string
  slug: string
  path: string
  doctypeName: string
  title: string
  status: string | undefined
}

export type StatusSummary = {
  doctype: string
  open: number
  closed: number
}

// ---------------------------------------------------------------------------
// List documents with filtering
// ---------------------------------------------------------------------------

export function listDocuments(
  project: ResolvedProject,
  filter: ListFilter = {},
): ListEntry[] {
  const allDocs = collectAllDocuments(project)
  const results: ListEntry[] = []

  // If filtering by parentId (descendants), we need to build the descendant set
  let descendantIds: Set<number> | null = null
  if (filter.parentId !== undefined) {
    descendantIds = findDescendantIds(allDocs, filter.parentId)
  }

  for (const doc of allDocs) {
    // Filter by doctype
    if (filter.doctype !== undefined && doc.doctype.name !== filter.doctype) {
      continue
    }

    // Filter by descendant of parent
    if (descendantIds !== null && !descendantIds.has(doc.id)) {
      continue
    }

    // Read frontmatter for status filtering
    const content = readFileSync(doc.path, "utf-8")
    const { data } = parseFrontmatter(content)
    const status = typeof data.status === "string" ? data.status : undefined
    const title = typeof data.title === "string" ? data.title : doc.slug

    // Filter by exact status
    if (filter.status !== undefined && status !== filter.status) {
      continue
    }

    // Filter by open/closed
    const isClosed = status !== undefined &&
      doc.doctype.closedStatuses.includes(status)

    const showBoth = filter.open && filter.closed
    if (!showBoth) {
      if (filter.open && isClosed) continue
      if (filter.closed && !isClosed) continue

      // Default: show open only (when no explicit status filter)
      if (
        filter.status === undefined &&
        !filter.open &&
        !filter.closed &&
        isClosed
      ) {
        continue
      }
    }

    results.push({
      id: doc.id,
      tag: doc.tag,
      slug: doc.slug,
      path: doc.path,
      doctypeName: doc.doctype.name,
      title,
      status,
    })
  }

  return results
}

// ---------------------------------------------------------------------------
// Status summary
// ---------------------------------------------------------------------------

export function getStatusSummary(
  project: ResolvedProject,
): StatusSummary[] {
  const allDocs = collectAllDocuments(project)
  const counts = new Map<string, { open: number; closed: number }>()

  for (const doc of allDocs) {
    const content = readFileSync(doc.path, "utf-8")
    const { data } = parseFrontmatter(content)
    const status = typeof data.status === "string" ? data.status : undefined
    const isClosed = status !== undefined &&
      doc.doctype.closedStatuses.includes(status)

    const entry = counts.get(doc.doctype.name) ?? { open: 0, closed: 0 }
    if (isClosed) {
      entry.closed++
    } else {
      entry.open++
    }
    counts.set(doc.doctype.name, entry)
  }

  return Array.from(counts.entries()).map(([doctype, { open, closed }]) => ({
    doctype,
    open,
    closed,
  }))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find all descendant IDs of a given parent document.
 * Builds a parent map from frontmatter, then walks the tree.
 */
function findDescendantIds(
  allDocs: ScannedDocument[],
  parentId: number,
): Set<number> {
  // Build parent -> children map
  const childrenOf = new Map<number, number[]>()

  for (const doc of allDocs) {
    const content = readFileSync(doc.path, "utf-8")
    const { data } = parseFrontmatter(content)
    const parent = data.parent
    if (typeof parent === "number") {
      const children = childrenOf.get(parent) ?? []
      children.push(doc.id)
      childrenOf.set(parent, children)
    }
  }

  // BFS from parentId
  const descendants = new Set<number>()
  const queue = childrenOf.get(parentId) ?? []
  while (queue.length > 0) {
    const id = queue.shift()!
    if (descendants.has(id)) continue
    descendants.add(id)
    const children = childrenOf.get(id) ?? []
    queue.push(...children)
  }

  return descendants
}
