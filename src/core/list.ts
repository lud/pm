import type { PropertyFlag } from "../lib/properties.js"
import { findType, type ResolvedProject, type StatusConfig } from "./config.js"
import type { DocInfo } from "./docs.js"
import { loadDocInfo } from "./docs.js"
import { scanNodes } from "./nodes.js"
import { parseRefId } from "./refs.js"

/**
 * Listing core.
 *
 * Lists documents only — groups are structure, not work items; they
 * appear in `show`, `ready`, and `status`, not in `list`.
 * All functions throw plain Errors; the CLI shell maps to abortError.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ListEntry = {
  document: DocInfo
  /** The type name when the doc's tag is declared, else the raw tag. */
  type: string
  title: string
  status: string | undefined
}

export type ListOptions = {
  /** Type name or tag (shared namespace). */
  type?: string
  /** Direct children of this node (doc or group ID). */
  parentId?: number
  status?: string
  propertyFilters?: PropertyFlag[]
  done?: boolean
  blocked?: boolean
  allStatuses?: boolean
}

export type StatusCount = {
  status: string
  count: number
  isDone: boolean
  isBlocked: boolean
}

export type StatusSummary = {
  /** Type name, or the raw tag for undeclared tags. */
  type: string
  active: number
  blocked: number
  done: number
  statuses: StatusCount[]
}

// ---------------------------------------------------------------------------
// Status helpers (shared with ready.ts)
// ---------------------------------------------------------------------------

/** The effective status config for a doc tag: its declared type's, or
 * the global one for undeclared tags. */
export function statusConfigFor(
  project: ResolvedProject,
  tag: string,
): StatusConfig {
  const type = findType(project, tag)
  return type ?? project.statuses
}

export function classifyStatus(
  status: string | undefined,
  statuses: StatusConfig,
): "active" | "blocked" | "done" {
  if (status !== undefined && statuses.doneStatuses.includes(status)) {
    return "done"
  }
  if (status !== undefined && statuses.blockedStatuses.includes(status)) {
    return "blocked"
  }
  return "active"
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/**
 * List documents, sorted by ID.
 *
 * - `type` matches by name or tag; an unknown value is not an error
 *   (it may match undeclared tags directly).
 * - `parentId` keeps docs whose parent ref resolves to that ID.
 * - Default status filter: active only; `done`/`blocked` select those
 *   categories; `allStatuses` disables the filter. `status` matches the
 *   exact string.
 * - `propertyFilters` require exact frontmatter equality on every flag.
 */
export function listDocuments(
  project: ResolvedProject,
  options: ListOptions = {},
): ListEntry[] {
  const { docs } = scanNodes(project)

  let expectedTag: string | undefined
  let literalTag: string | undefined
  if (options.type !== undefined) {
    const type = findType(project, options.type)
    if (type) {
      expectedTag = type.tag
    } else {
      literalTag = options.type
    }
  }

  const entries: ListEntry[] = []
  for (const node of docs) {
    if (expectedTag !== undefined && node.tag !== expectedTag) continue
    if (literalTag !== undefined && node.tag !== literalTag) continue

    const doc = loadDocInfo(node)

    if (
      options.parentId !== undefined &&
      parseRefId(doc.frontmatter.parent) !== options.parentId
    ) {
      continue
    }

    const status =
      typeof doc.frontmatter.status === "string"
        ? doc.frontmatter.status
        : undefined

    if (options.status !== undefined) {
      if (status !== options.status) continue
    } else {
      const statuses = statusConfigFor(project, node.tag)
      const category = classifyStatus(status, statuses)
      if (options.done) {
        if (category !== "done") continue
      } else if (options.blocked) {
        if (category !== "blocked") continue
      } else if (!options.allStatuses) {
        if (category !== "active") continue
      }
    }

    if (options.propertyFilters && options.propertyFilters.length > 0) {
      const matches = options.propertyFilters.every(
        (f) => doc.frontmatter[f.key] === f.value,
      )
      if (!matches) continue
    }

    const type = findType(project, node.tag)
    const title =
      typeof doc.frontmatter.title === "string"
        ? doc.frontmatter.title
        : node.slug

    entries.push({
      document: doc,
      type: type ? type.name : node.tag,
      title,
      status,
    })
  }

  entries.sort((a, b) => a.document.id - b.document.id)
  return entries
}

// ---------------------------------------------------------------------------
// Status summary
// ---------------------------------------------------------------------------

/**
 * Per-type counts (active/blocked/done) plus per-status breakdowns.
 * Grouped by type name (raw tag for undeclared tags), in declaration
 * order, undeclared tags last alphabetically. Within a summary, statuses
 * sort: active alphabetically, then blocked, then done. Docs without a
 * status count as active under the pseudo-status "(none)".
 */
export function getStatusSummary(project: ResolvedProject): StatusSummary[] {
  const { docs } = scanNodes(project)

  type GroupData = {
    statuses: StatusConfig
    active: number
    blocked: number
    done: number
    statusCounts: Map<string, number>
  }

  const groups = new Map<string, GroupData>()
  const undeclaredKeys = new Set<string>()

  for (const node of docs) {
    // Shared name/tag namespace: a file tagged with the type *name* still
    // counts as that type, consistently with listDocuments/statusConfigFor.
    const type = findType(project, node.tag)
    const key = type ? type.name : node.tag
    if (!type) undeclaredKeys.add(key)

    const group = groups.get(key) ?? {
      statuses: type ?? project.statuses,
      active: 0,
      blocked: 0,
      done: 0,
      statusCounts: new Map(),
    }

    const doc = loadDocInfo(node)
    const rawStatus =
      typeof doc.frontmatter.status === "string"
        ? doc.frontmatter.status
        : undefined
    const status = rawStatus ?? "(none)"
    const category =
      rawStatus === undefined
        ? "active"
        : classifyStatus(status, group.statuses)

    if (category === "done") group.done++
    else if (category === "blocked") group.blocked++
    else group.active++

    group.statusCounts.set(status, (group.statusCounts.get(status) ?? 0) + 1)
    groups.set(key, group)
  }

  const declaredOrder = Object.values(project.types)
    .map((t) => t.name)
    .filter((name) => groups.has(name))
  const undeclaredOrder = [...undeclaredKeys].sort((a, b) => a.localeCompare(b))
  const order = [...declaredOrder, ...undeclaredOrder]

  return order.map((key) => {
    const group = groups.get(key)!
    const statuses: StatusCount[] = [...group.statusCounts.entries()].map(
      ([status, count]) => ({
        status,
        count,
        isDone:
          status !== "(none)" && group.statuses.doneStatuses.includes(status),
        isBlocked:
          status !== "(none)" &&
          group.statuses.blockedStatuses.includes(status),
      }),
    )

    const activeStatuses = statuses.filter((s) => !s.isDone && !s.isBlocked)
    const blockedStatuses = statuses.filter((s) => s.isBlocked)
    const doneStatuses = statuses.filter((s) => s.isDone)
    activeStatuses.sort((a, b) => a.status.localeCompare(b.status))
    blockedStatuses.sort((a, b) => a.status.localeCompare(b.status))
    doneStatuses.sort((a, b) => a.status.localeCompare(b.status))

    return {
      type: key,
      active: group.active,
      blocked: group.blocked,
      done: group.done,
      statuses: [...activeStatuses, ...blockedStatuses, ...doneStatuses],
    }
  })
}
