import { basename, dirname, join } from "node:path"
import { setFrontmatterProperties } from "../lib/frontmatter.js"
import {
  mkdirSyncOrThrow,
  readdirSyncOrThrow,
  readFileSyncOrThrow,
  renameSyncOrThrow,
  rmdirSyncOrThrow,
  writeFileSyncOrThrow,
} from "../lib/fs-helpers.js"
import type { ResolvedProject } from "./config.js"
import { type DocInfo, loadDocInfo, slugify } from "./docs.js"
import {
  type DocNode,
  formatDocFilename,
  type GroupNode,
  maxNodeId,
  type Node,
  type ScanResult,
  scanNodes,
} from "./nodes.js"
import {
  formatDocRef,
  formatGroupRef,
  parseDepends,
  parseNodeRef,
  parseRefId,
} from "./refs.js"

/**
 * Tidy. Two phases: buildTidyPlan
 * computes everything without touching disk; applyTidyPlan executes.
 *
 * The plan converges a project in one run:
 *  1. ID collisions across ALL nodes (docs and groups share the
 *     sequence): among colliders, the first doc in path order keeps the
 *     ID; the other docs (path order), then the groups (path order),
 *     take fresh IDs from maxId+1.
 *  2. Every group directory is renamed to its expected `{paddedId}.{slug}`
 *     name — this rewrites legacy `{id}.{tag}.{slug}` dirs tag-less and
 *     applies renumbering in one rename.
 *  3. Parent refs are rewritten to canonical qualified padded form
 *     against the actual target node (bare numerics expanded, stale
 *     hints healed, renumbered targets followed). For a ref to a
 *     duplicated ID, the slug hint (slug only — the tag may have
 *     drifted) picks the candidate; an ambiguous ref falls back
 *     to the prompt, else a warning and the ref is left untouched.
 *  4. Adoption: a doc inside a group dir with no parent ref gets
 *     `parent: {group-ref}`.
 *  5. depends entries are rewritten to canonical refs with remapped IDs;
 *     entries resolving to a group, to nothing, or malformed produce a
 *     warning and stay verbatim (warn, never fix).
 *  6. Docs move to their expected path: parent doc's directory, parent
 *     group's (renamed) directory, or the root; filenames heal slug
 *     drift against the title. A doc with an unresolvable parent ref
 *     stays where it is (warning).
 *
 * Apply order: frontmatter edits (at current paths), then group dir
 *  renames, then doc moves (whose `from` paths already account for the
 *  renames), then empty source dirs are removed bottom-up.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GroupRename = {
  group: GroupNode
  newId: number
  from: string
  to: string
}

export type TidyEdit = {
  /** Pre-rename absolute path of the file to edit. */
  path: string
  /** Frontmatter keys to set (parent and/or depends). */
  updates: Record<string, unknown>
}

export type DocMove = {
  doc: DocNode
  /** Where the file will be once group renames have run. */
  from: string
  to: string
}

export type Renumbering = {
  node: Node
  newId: number
}

export type TidyPlan = {
  groupRenames: GroupRename[]
  edits: TidyEdit[]
  moves: DocMove[]
  renumberings: Renumbering[]
  warnings: string[]
}

/** Resolve an ambiguous parent among duplicate candidates. Return null
 * to leave the ref untouched (a warning is emitted). */
export type ParentPrompt = (
  child: DocInfo,
  candidates: Node[],
) => Promise<Node | null>

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

type Resolution =
  | { kind: "ok"; node: Node }
  | { kind: "ambiguous"; id: number; candidates: Node[] }
  | { kind: "missing"; id: number }
  | { kind: "malformed" }

type DocState = {
  doc: DocInfo
  newId: number
  /** The node the doc will live under, when known. */
  parent:
    | { kind: "node"; node: Node }
    | { kind: "root" }
    | { kind: "unresolved" }
}

export async function buildTidyPlan(
  project: ResolvedProject,
  promptForParent?: ParentPrompt,
): Promise<TidyPlan> {
  const scan = scanNodes(project)
  const docs = scan.docs.map(loadDocInfo)
  const warnings: string[] = []

  // -- 1. ID collisions ----------------------------------------------------
  const newIdByPath = new Map<string, number>()
  const renumberings: Renumbering[] = []
  {
    const byId = new Map<number, { docs: DocInfo[]; groups: GroupNode[] }>()
    for (const doc of docs) {
      const entry = byId.get(doc.id) ?? { docs: [], groups: [] }
      entry.docs.push(doc)
      byId.set(doc.id, entry)
    }
    for (const group of scan.groups) {
      const entry = byId.get(group.id) ?? { docs: [], groups: [] }
      entry.groups.push(group)
      byId.set(group.id, entry)
    }

    let nextId = maxNodeId(scan)
    for (const id of [...byId.keys()].sort((a, b) => a - b)) {
      const { docs: dupDocs, groups: dupGroups } = byId.get(id)!
      const losers = [...dupDocs, ...dupGroups].slice(1)
      // docs and groups are each path-sorted by the scanner; the first
      // doc (or first group, when no doc carries the ID) keeps it
      for (const node of losers) {
        nextId++
        newIdByPath.set(node.path, nextId)
        renumberings.push({ node, newId: nextId })
      }
    }
  }

  const newIdOf = (node: Node): number => newIdByPath.get(node.path) ?? node.id

  // -- 2. Group renames ----------------------------------------------------
  const groupRenames: GroupRename[] = []
  const newGroupPath = new Map<string, string>()
  for (const group of scan.groups) {
    const newId = newIdOf(group)
    const to = join(
      dirname(group.path),
      `${project.formatId(newId)}.${group.slug}`,
    )
    newGroupPath.set(group.path, to)
    if (to !== group.path) {
      groupRenames.push({ group, newId, from: group.path, to })
    }
  }

  // -- 3. Ref resolution ---------------------------------------------------
  const nodesById = new Map<number, { docs: DocInfo[]; groups: GroupNode[] }>()
  for (const doc of docs) {
    const entry = nodesById.get(doc.id) ?? { docs: [], groups: [] }
    entry.docs.push(doc)
    nodesById.set(doc.id, entry)
  }
  for (const group of scan.groups) {
    const entry = nodesById.get(group.id) ?? { docs: [], groups: [] }
    entry.groups.push(group)
    nodesById.set(group.id, entry)
  }

  function resolveRef(raw: unknown): Resolution {
    const id = parseRefId(raw)
    if (id === null) return { kind: "malformed" }
    const entry = nodesById.get(id)
    if (!entry || entry.docs.length + entry.groups.length === 0) {
      return { kind: "missing", id }
    }
    const candidates: Node[] = [...entry.docs, ...entry.groups]
    if (candidates.length === 1) return { kind: "ok", node: candidates[0] }

    const ref = typeof raw === "string" ? parseNodeRef(raw.trim()) : null
    if (ref !== null) {
      let matches = candidates.filter((n) => n.slug === ref.slug)
      if (matches.length > 1) {
        // the ref's form breaks the doc/group tie for a shared slug
        matches = matches.filter((n) => n.kind === ref.kind)
      }
      if (matches.length === 1) return { kind: "ok", node: matches[0] }
    }
    // bare or unmatched hint: a single doc wins over directories
    if (entry.docs.length === 1) return { kind: "ok", node: entry.docs[0] }
    return { kind: "ambiguous", id, candidates }
  }

  const healedSlug = (doc: DocInfo): string => {
    const title = doc.frontmatter.title
    if (typeof title === "string" && title.trim() !== "") {
      const slug = slugify(title)
      if (slug !== "") return slug
    }
    return doc.slug
  }

  const canonicalRef = (node: Node): string =>
    node.kind === "doc"
      ? formatDocRef(
          newIdOf(node),
          node.tag,
          healedSlug(node as DocInfo),
          project.formatId,
        )
      : formatGroupRef(newIdOf(node), node.slug, project.formatId)

  const groupByDirname = (doc: DocInfo): GroupNode | undefined =>
    scan.groups.find((g) => g.path === dirname(doc.path))

  // -- 4. Per-doc edits ----------------------------------------------------
  const edits: TidyEdit[] = []
  const states = new Map<string, DocState>()

  for (const doc of docs) {
    const updates: Record<string, unknown> = {}
    let parent: DocState["parent"]

    const rawParent = doc.frontmatter.parent
    if (rawParent === undefined) {
      const group = groupByDirname(doc)
      if (group) {
        // adoption: legitimize the drop-a-file-in-the-dir gesture
        updates.parent = canonicalRef(group)
        parent = { kind: "node", node: group }
      } else {
        parent = { kind: "root" }
      }
    } else {
      let res = resolveRef(rawParent)
      if (res.kind === "ambiguous" && promptForParent) {
        const choice = await promptForParent(doc, res.candidates)
        if (choice) res = { kind: "ok", node: choice }
      }
      switch (res.kind) {
        case "ok": {
          const ref = canonicalRef(res.node)
          if (ref !== rawParent) updates.parent = ref
          parent = { kind: "node", node: res.node }
          break
        }
        case "ambiguous":
          warnings.push(
            `${doc.path}: ambiguous parent ref ${JSON.stringify(rawParent)} — ` +
              `${res.candidates.length} nodes share ID ${res.id}; left untouched`,
          )
          parent = { kind: "unresolved" }
          break
        case "missing":
          warnings.push(
            `${doc.path}: parent ref ${JSON.stringify(rawParent)} resolves to ` +
              `no node (ID ${res.id}); left untouched`,
          )
          parent = { kind: "unresolved" }
          break
        case "malformed":
          warnings.push(
            `${doc.path}: malformed parent ref ${JSON.stringify(rawParent)}; ` +
              `left untouched`,
          )
          parent = { kind: "unresolved" }
          break
      }
    }

    const rawDepends = doc.frontmatter.depends
    if (rawDepends !== undefined) {
      const entries = parseDepends(rawDepends)
      const rewritten = entries.map((entry) => {
        if (entry.id === null) {
          warnings.push(
            `${doc.path}: malformed depends entry ${JSON.stringify(entry.raw)}; kept as-is`,
          )
          return entry.raw
        }
        const res = resolveRef(entry.raw)
        if (res.kind === "ok" && res.node.kind === "doc") {
          return canonicalRef(res.node)
        }
        if (res.kind === "ok") {
          // a group: warn, never fix
          warnings.push(
            `${doc.path}: depends entry ${JSON.stringify(entry.raw)} names a ` +
              `group; groups cannot be depended on — kept as-is`,
          )
        } else if (res.kind === "missing") {
          warnings.push(
            `${doc.path}: depends entry ${JSON.stringify(entry.raw)} resolves ` +
              `to no node (ID ${res.id}); kept as-is`,
          )
        } else {
          warnings.push(
            `${doc.path}: ambiguous depends entry ${JSON.stringify(entry.raw)}; kept as-is`,
          )
        }
        return entry.raw
      })
      const original = Array.isArray(rawDepends) ? rawDepends : [rawDepends]
      if (JSON.stringify(rewritten) !== JSON.stringify(original)) {
        updates.depends = rewritten
      }
    }

    if (Object.keys(updates).length > 0) {
      edits.push({ path: doc.path, updates })
    }
    states.set(doc.path, { doc, newId: newIdOf(doc), parent })
  }

  // -- 5. Expected paths and moves -----------------------------------------
  const postRenamePath = (doc: DocInfo): string => {
    const dir = dirname(doc.path)
    return join(newGroupPath.get(dir) ?? dir, basename(doc.path))
  }

  const expectedPathMemo = new Map<string, string>()
  const resolving = new Set<string>()

  function expectedPath(state: DocState): string {
    const memo = expectedPathMemo.get(state.doc.path)
    if (memo !== undefined) return memo

    const filename = formatDocFilename(
      state.newId,
      state.doc.tag,
      healedSlug(state.doc),
      project.formatId,
    )

    let dir: string
    if (resolving.has(state.doc.path)) {
      // parent cycle — stay put
      dir = dirname(postRenamePath(state.doc))
    } else {
      resolving.add(state.doc.path)
      const parent = state.parent
      if (parent.kind === "root") {
        dir = project.rootDir
      } else if (parent.kind === "unresolved") {
        dir = dirname(postRenamePath(state.doc))
      } else if (parent.node.kind === "group") {
        dir = newGroupPath.get(parent.node.path) ?? parent.node.path
      } else {
        const parentState = states.get(parent.node.path)
        dir = parentState
          ? dirname(expectedPath(parentState))
          : dirname(postRenamePath(state.doc))
      }
      resolving.delete(state.doc.path)
    }

    const path = join(dir, filename)
    expectedPathMemo.set(state.doc.path, path)
    return path
  }

  const moves: DocMove[] = []
  for (const doc of docs) {
    const state = states.get(doc.path)!
    const from = postRenamePath(doc)
    const to = expectedPath(state)
    if (from !== to) {
      moves.push({ doc, from, to })
    }
  }

  return { groupRenames, edits, moves, renumberings, warnings }
}

export function isNoopPlan(plan: TidyPlan): boolean {
  return (
    plan.groupRenames.length === 0 &&
    plan.edits.length === 0 &&
    plan.moves.length === 0
  )
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

export function applyTidyPlan(plan: TidyPlan): void {
  for (const edit of plan.edits) {
    const content = readFileSyncOrThrow(edit.path, "utf-8")
    writeFileSyncOrThrow(
      edit.path,
      setFrontmatterProperties(content, edit.updates),
    )
  }

  for (const rename of plan.groupRenames) {
    renameSyncOrThrow(rename.from, rename.to)
  }

  const sourceDirs = new Set<string>()
  for (const move of plan.moves) {
    sourceDirs.add(dirname(move.from))
    mkdirSyncOrThrow(dirname(move.to), { recursive: true })
    renameSyncOrThrow(move.from, move.to)
  }

  // bottom-up: longer paths first
  for (const dir of [...sourceDirs].sort((a, b) => b.length - a.length)) {
    tryRemoveEmptyDir(dir)
  }
}

function tryRemoveEmptyDir(dir: string): void {
  try {
    if (readdirSyncOrThrow(dir).length === 0) rmdirSyncOrThrow(dir)
  } catch {
    // gone or unreadable — fine
  }
}

// re-exported for the command layer's plan display
export type { ScanResult }
