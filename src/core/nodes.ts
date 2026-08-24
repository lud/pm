import type { Dirent } from "node:fs"
import { join } from "node:path"
import { readdirSyncOrThrow } from "../lib/fs-helpers.js"
import type { ResolvedProject } from "./config.js"
import { parseNodeRef } from "./refs.js"

/**
 * The scanner.
 *
 * Documents are found in exactly two places: the root directory, and
 * inside managed directories at its top level. A managed directory is
 * one whose name matches `{id}.{slug}` (a group) or the legacy
 * `{id}.{tag}.{slug}` form (recognized as a group; tidy renames it
 * tag-less). Any other directory is never entered — a node_modules
 * inside the root must stay invisible. No recursion: groups cannot
 * nest, so a pattern-matching directory inside a group is not entered
 * and yields a warning instead.
 */

export type DocNode = {
  kind: "doc"
  id: number
  tag: string
  slug: string
  /** Absolute file path. */
  path: string
  /** ID of the group whose directory contains the doc, null at root. */
  groupId: number | null
}

export type GroupNode = {
  kind: "group"
  id: number
  slug: string
  /** Absolute directory path. */
  path: string
  /** The tag in a legacy `{id}.{tag}.{slug}` directory name, else null. */
  legacyTag: string | null
}

export type Node = DocNode | GroupNode

export type ScanResult = {
  docs: DocNode[]
  groups: GroupNode[]
  warnings: string[]
}

/** A filename that starts like a document but does not parse as one —
 * likely a typo (missing tag, bad slug) the user should see. */
const DOCLIKE_FILE_REGEX = /^\d+\./

export function formatDocFilename(
  id: number,
  tag: string,
  slug: string,
  formatId: (id: number) => string = String,
): string {
  return `${formatId(id)}.${tag}.${slug}.md`
}

export function scanNodes(project: ResolvedProject): ScanResult {
  const docs: DocNode[] = []
  const groups: GroupNode[] = []
  const warnings: string[] = []

  let rootEntries: Dirent[]
  try {
    rootEntries = readdirSyncOrThrow(project.rootDir, { withFileTypes: true })
  } catch {
    throw new Error(
      `Root directory not found: ${project.rootDir} ` +
        `(check "directory" in ${project.projectFile})`,
    )
  }

  for (const entry of rootEntries) {
    const path = join(project.rootDir, entry.name)

    if (entry.isDirectory()) {
      const ref = parseNodeRef(entry.name)
      if (ref === null) continue // unmanaged directory — never entered

      const group: GroupNode =
        ref.kind === "group"
          ? { kind: "group", id: ref.id, slug: ref.slug, path, legacyTag: null }
          : {
              kind: "group",
              id: ref.id,
              slug: ref.slug,
              path,
              legacyTag: ref.tag,
            }
      groups.push(group)
      scanGroupDir(group, docs, warnings)
      continue
    }

    if (entry.isFile()) {
      collectFile(entry.name, path, null, docs, warnings)
    }
  }

  sortByPath(docs)
  sortByPath(groups)
  return { docs, groups, warnings }
}

function scanGroupDir(
  group: GroupNode,
  docs: DocNode[],
  warnings: string[],
): void {
  for (const entry of readdirSyncOrThrow(group.path, { withFileTypes: true })) {
    const path = join(group.path, entry.name)

    if (entry.isDirectory()) {
      // No recursion (groups cannot nest) — but a pattern-matching dir
      // in here is probably a hand-made mistake hiding documents.
      if (parseNodeRef(entry.name) !== null) {
        warnings.push(
          `Ignored nested directory ${path}: groups cannot contain groups`,
        )
      }
      continue
    }

    if (entry.isFile()) {
      collectFile(entry.name, path, group.id, docs, warnings)
    }
  }
}

function collectFile(
  name: string,
  path: string,
  groupId: number | null,
  docs: DocNode[],
  warnings: string[],
): void {
  if (!name.endsWith(".md")) return

  const ref = parseNodeRef(name.slice(0, -3))
  if (ref?.kind === "doc") {
    docs.push({
      kind: "doc",
      id: ref.id,
      tag: ref.tag,
      slug: ref.slug,
      path,
      groupId,
    })
    return
  }

  // "12.foo.md" (group-form name) or "12..md" — looks intended, isn't valid
  if (DOCLIKE_FILE_REGEX.test(name)) {
    warnings.push(
      `Ignored file ${path}: name does not match {id}.{tag}.{slug}.md`,
    )
  }
}

function sortByPath(nodes: { path: string }[]): void {
  nodes.sort((a, b) => a.path.localeCompare(b.path))
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * Resolve an ID against a scan. When both a doc and a group carry the
 * ID, the doc wins (the legacy intermediateDir case; tidy
 * renumbers the directory). Duplicate docs with the same ID are tidy's
 * business — this returns the first in path order.
 */
export function findNodeById(scan: ScanResult, id: number): Node | null {
  const doc = scan.docs.find((d) => d.id === id)
  if (doc) return doc
  return scan.groups.find((g) => g.id === id) ?? null
}

/** Highest ID in use across docs and groups, 0 when empty. */
export function maxNodeId(scan: ScanResult): number {
  let max = 0
  for (const node of [...scan.docs, ...scan.groups]) {
    if (node.id > max) max = node.id
  }
  return max
}
