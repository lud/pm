import { readFileSync } from "node:fs"
import { parseFrontmatter } from "../lib/frontmatter.js"
import type { ResolvedDoctype, ResolvedProject } from "../lib/project.js"
import type { PropertyFlag } from "../lib/properties.js"
import { extractParentId } from "./parent-ref.js"
import { type DocumentFile, scanDocuments } from "./scanner.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ListEntry = {
  document: DocumentFile
  doctypeName: string
  title: string
  status: string | undefined
}

export type ListOptions = {
  doctype?: string
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
  doctype: string
  active: number
  blocked: number
  done: number
  statuses: StatusCount[]
}

// ---------------------------------------------------------------------------
// Predicate-based list filtering
// ---------------------------------------------------------------------------

type Predicate = {
  filter: (entry: ReaderResult) => boolean
  requiresFrontmatter: boolean
}

type ReaderResult = {
  doc: DocumentFile
  frontmatter?: Record<string, unknown>
  status?: string
  title?: string
  parentId?: number | null
}

function classifyStatus(
  status: string | undefined,
  doctype: ResolvedDoctype,
): "active" | "blocked" | "done" {
  if (status !== undefined && doctype.doneStatuses.includes(status)) {
    return "done"
  }
  if (status !== undefined && doctype.blockedStatuses.includes(status)) {
    return "blocked"
  }
  return "active"
}

function buildPredicates(options: ListOptions): Predicate[] {
  const predicates: Predicate[] = []

  if (options.doctype !== undefined) {
    const dt = options.doctype
    predicates.push({
      filter: (r) => r.doc.doctype.name === dt,
      requiresFrontmatter: false,
    })
  }

  if (options.parentId !== undefined) {
    const parentId = options.parentId
    predicates.push({
      filter: (r) => r.parentId === parentId,
      requiresFrontmatter: true,
    })
  }

  if (options.status !== undefined) {
    const status = options.status
    predicates.push({
      filter: (r) => r.status === status,
      requiresFrontmatter: true,
    })
  }

  if (options.propertyFilters && options.propertyFilters.length > 0) {
    const filters = options.propertyFilters
    predicates.push({
      filter: (r) => filters.every((f) => r.frontmatter![f.key] === f.value),
      requiresFrontmatter: true,
    })
  }

  // Status category filter (default: active only)
  if (options.done) {
    predicates.push({
      filter: (r) => classifyStatus(r.status, r.doc.doctype) === "done",
      requiresFrontmatter: true,
    })
  } else if (options.blocked) {
    predicates.push({
      filter: (r) => classifyStatus(r.status, r.doc.doctype) === "blocked",
      requiresFrontmatter: true,
    })
  } else if (!options.allStatuses) {
    // Default: active only
    predicates.push({
      filter: (r) => classifyStatus(r.status, r.doc.doctype) === "active",
      requiresFrontmatter: true,
    })
  }

  return predicates
}

export function listDocuments(
  project: ResolvedProject,
  options: ListOptions = {},
): ListEntry[] {
  const predicates = buildPredicates(options)
  const needsFrontmatter = predicates.some((p) => p.requiresFrontmatter)
  const filterFn = (r: ReaderResult) => predicates.every((p) => p.filter(r))

  const results: ListEntry[] = []

  for (const doc of scanDocuments(project)) {
    const result: ReaderResult = { doc }

    if (needsFrontmatter) {
      const content = readFileSync(doc.path, "utf-8")
      const { data } = parseFrontmatter(content)
      result.frontmatter = data
      result.status = data.status as string | undefined
      result.title = typeof data.title === "string" ? data.title : undefined
      result.parentId = extractParentId(data.parent)
    }

    if (!filterFn(result)) continue

    // If we didn't read frontmatter yet (all predicates were metadata-only),
    // read it now for the output fields
    if (!needsFrontmatter) {
      const content = readFileSync(doc.path, "utf-8")
      const { data } = parseFrontmatter(content)
      result.frontmatter = data
      result.status = data.status as string | undefined
      result.title = typeof data.title === "string" ? data.title : undefined
    }

    results.push({
      document: doc,
      doctypeName: doc.doctype.name,
      title: result.title ?? doc.slug,
      status: result.status,
    })
  }

  results.sort((a, b) => a.document.id - b.document.id)
  return results
}

// ---------------------------------------------------------------------------
// Status summary
// ---------------------------------------------------------------------------

export function getStatusSummary(project: ResolvedProject): StatusSummary[] {
  const doctypeData = new Map<
    string,
    {
      active: number
      blocked: number
      done: number
      doneStatuses: string[]
      blockedStatuses: string[]
      statusCounts: Map<string, number>
    }
  >()

  for (const doc of scanDocuments(project)) {
    const content = readFileSync(doc.path, "utf-8")
    const { data } = parseFrontmatter(content)
    const status = (data.status as string | undefined) ?? "(none)"
    const category = classifyStatus(
      status === "(none)" ? undefined : status,
      doc.doctype,
    )

    const entry = doctypeData.get(doc.doctype.name) ?? {
      active: 0,
      blocked: 0,
      done: 0,
      doneStatuses: doc.doctype.doneStatuses,
      blockedStatuses: doc.doctype.blockedStatuses,
      statusCounts: new Map(),
    }

    if (category === "done") {
      entry.done++
    } else if (category === "blocked") {
      entry.blocked++
    } else {
      entry.active++
    }
    entry.statusCounts.set(status, (entry.statusCounts.get(status) ?? 0) + 1)
    doctypeData.set(doc.doctype.name, entry)
  }

  return Array.from(doctypeData.entries()).map(
    ([
      doctype,
      { active, blocked, done, doneStatuses, blockedStatuses, statusCounts },
    ]) => {
      const statuses = Array.from(statusCounts.entries()).map(
        ([status, count]) => ({
          status,
          count,
          isDone: doneStatuses.includes(status),
          isBlocked: blockedStatuses.includes(status),
        }),
      )

      // Sort: active alphabetically, then blocked alphabetically, then done alphabetically
      const activeStatuses = statuses.filter((s) => !s.isDone && !s.isBlocked)
      const blockedStatusList = statuses.filter((s) => s.isBlocked)
      const doneStatusList = statuses.filter((s) => s.isDone)

      activeStatuses.sort((a, b) => a.status.localeCompare(b.status))
      blockedStatusList.sort((a, b) => a.status.localeCompare(b.status))
      doneStatusList.sort((a, b) => a.status.localeCompare(b.status))

      const sortedStatuses = [
        ...activeStatuses,
        ...blockedStatusList,
        ...doneStatusList,
      ]

      return { doctype, active, blocked, done, statuses: sortedStatuses }
    },
  )
}
