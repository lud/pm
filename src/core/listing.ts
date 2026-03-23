import { readFileSync } from "node:fs"
import { parseFrontmatter } from "../lib/frontmatter.js"
import type { ResolvedProject } from "../lib/project.js"
import { collectAllDocuments, type ScannedDocument } from "./scanner.js"
import { extractParentId } from "./parent-ref.js"
import type { DocumentInfo } from "./documents.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ListFilter = {
  doctype?: string
  parentId?: number
  status?: string
  active?: boolean
  done?: boolean
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

export type StatusCount = {
  status: string
  count: number
  isDone: boolean
}

export type StatusSummary = {
  doctype: string
  active: number
  done: number
  statuses: StatusCount[]
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

    // Filter by active/done
    const isDone =
      status !== undefined && doc.doctype.doneStatuses.includes(status)

    const showBoth = filter.active && filter.done
    if (!showBoth) {
      if (filter.active && isDone) continue
      if (filter.done && !isDone) continue

      // Default: show active only (when no explicit status filter)
      if (
        filter.status === undefined &&
        !filter.active &&
        !filter.done &&
        isDone
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

  results.sort((a, b) => a.id - b.id)
  return results
}

// ---------------------------------------------------------------------------
// Status summary
// ---------------------------------------------------------------------------

export function getStatusSummary(project: ResolvedProject): StatusSummary[] {
  const allDocs = collectAllDocuments(project)

  const doctypeData = new Map<
    string,
    {
      active: number
      done: number
      doneStatuses: string[]
      statusCounts: Map<string, number>
    }
  >()

  for (const doc of allDocs) {
    const content = readFileSync(doc.path, "utf-8")
    const { data } = parseFrontmatter(content)
    const status = typeof data.status === "string" ? data.status : "(none)"
    const isDone =
      status !== "(none)" && doc.doctype.doneStatuses.includes(status)

    const entry = doctypeData.get(doc.doctype.name) ?? {
      active: 0,
      done: 0,
      doneStatuses: doc.doctype.doneStatuses,
      statusCounts: new Map(),
    }

    if (isDone) {
      entry.done++
    } else {
      entry.active++
    }
    entry.statusCounts.set(status, (entry.statusCounts.get(status) ?? 0) + 1)
    doctypeData.set(doc.doctype.name, entry)
  }

  return Array.from(doctypeData.entries()).map(
    ([doctype, { active, done, doneStatuses, statusCounts }]) => {
      const statuses = Array.from(statusCounts.entries()).map(
        ([status, count]) => ({
          status,
          count,
          isDone: doneStatuses.includes(status),
        }),
      )

      // Non-terminal alphabetically, then terminal alphabetically
      statuses.sort((a, b) => {
        if (a.isDone !== b.isDone) return a.isDone ? 1 : -1
        return a.status.localeCompare(b.status)
      })

      return { doctype, active, done, statuses }
    },
  )
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
    const parentId = extractParentId(data.parent)
    if (parentId !== null) {
      const children = childrenOf.get(parentId) ?? []
      children.push(doc.id)
      childrenOf.set(parentId, children)
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
