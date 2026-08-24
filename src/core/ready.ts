import { findType, type ResolvedProject } from "./config.js"
import { loadDocInfo } from "./docs.js"
import { classifyStatus, statusConfigFor } from "./list.js"
import {
  type DocNode,
  findNodeById,
  type GroupNode,
  type Node,
  scanNodes,
} from "./nodes.js"
import { parseDepends, parseRefId } from "./refs.js"

/**
 * Ready tree — the `depends:`-aware view of actionable work.
 *
 * A doc is actionable when its status classifies as active (or as
 * anything but done, with `withBlocked`) AND all its dependencies are
 * done. Entries form a depth-first tree: every actionable doc appears
 * under its parent chain; non-actionable docs and groups appear only
 * when an actionable descendant needs them as context.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReadyEntry = {
  node: DocNode | GroupNode
  /** Type name (raw tag when undeclared); null for groups. */
  type: string | null
  /** Frontmatter title for docs (slug fallback); slug for groups. */
  title: string
  /** Always undefined for groups. */
  status: string | undefined
  depth: number
  isCurrent: boolean
}

export type ReadyResult = {
  entries: ReadyEntry[]
  /** depends: hygiene — group refs (warn and ignore), missing
   * targets, malformed entries. */
  warnings: string[]
}

export type ReadyOptions = {
  /** Also treat blocked-status and dependency-waiting docs as actionable. */
  withBlocked?: boolean
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

type TreeNode = {
  node: DocNode | GroupNode
  type: string | null
  title: string
  status: string | undefined
  parentId: number | null
  children: number[]
  isActionable: boolean
  hasActionableDescendant: boolean
}

/**
 * Build the ready tree.
 *
 * - Docs parent to docs or groups via their `parent:` ref (ID-resolved
 *   against the scan); docs with no parent or an unresolvable one are
 *   roots. Groups are roots. Children sort by ID, roots too.
 * - Dependency gate: every `depends:` entry that resolves to a doc must
 *   classify as done, else the doc is not actionable (it still appears,
 *   with `withBlocked`). Entries that are malformed, resolve to a
 *   group, or resolve to nothing produce a warning and do not gate.
 * - Groups are never actionable; they appear (status undefined) only on
 *   the path to an actionable descendant. `currentId` may be a group.
 */
export function buildReadyTree(
  project: ResolvedProject,
  currentId: number | null,
  options: ReadyOptions = {},
): ReadyResult {
  const scan = scanNodes(project)
  const warnings: string[] = []
  const nodes = new Map<number, TreeNode>()

  // Groups are always roots — they cannot have parents
  for (const group of scan.groups) {
    nodes.set(group.id, {
      node: group,
      type: null,
      title: group.slug,
      status: undefined,
      parentId: null,
      children: [],
      isActionable: false,
      hasActionableDescendant: false,
    })
  }

  // Docs
  for (const docNode of scan.docs) {
    const info = loadDocInfo(docNode)
    const title =
      typeof info.frontmatter.title === "string" &&
      info.frontmatter.title.trim() !== ""
        ? info.frontmatter.title
        : docNode.slug
    const status =
      typeof info.frontmatter.status === "string"
        ? info.frontmatter.status
        : undefined
    const typeConfig = findType(project, docNode.tag)
    const statusConfig = typeConfig ?? project.statuses
    const category = classifyStatus(status, statusConfig)

    const statusOk = options.withBlocked
      ? category !== "done"
      : category === "active"

    const dependsGateOk = evaluateDepends(
      project,
      scan,
      info.frontmatter.depends,
      warnings,
    )

    const isActionable = options.withBlocked
      ? statusOk
      : statusOk && dependsGateOk

    let parentId: number | null = null
    const rawParentId = parseRefId(info.frontmatter.parent)
    if (rawParentId !== null) {
      const parentNode = findNodeById(scan, rawParentId)
      if (parentNode !== null) parentId = parentNode.id
    }

    nodes.set(docNode.id, {
      node: docNode,
      type: typeConfig?.name ?? docNode.tag,
      title,
      status,
      parentId,
      children: [],
      isActionable,
      hasActionableDescendant: false,
    })
  }

  // Build parent-child links
  for (const node of nodes.values()) {
    if (node.parentId !== null) {
      const parent = nodes.get(node.parentId)
      if (parent) parent.children.push(node.node.id)
    }
  }
  for (const node of nodes.values()) {
    node.children.sort((a, b) => a - b)
  }

  // Roots: groups (always) and docs with no resolvable parent
  const roots: number[] = []
  for (const node of nodes.values()) {
    if (node.node.kind === "group" || node.parentId === null) {
      roots.push(node.node.id)
    }
  }
  roots.sort((a, b) => a - b)

  function markDescendants(nodeId: number): boolean {
    const node = nodes.get(nodeId)
    if (!node) return false
    for (const childId of node.children) {
      if (markDescendants(childId)) {
        node.hasActionableDescendant = true
      }
    }
    return node.isActionable || node.hasActionableDescendant
  }

  for (const rootId of roots) {
    markDescendants(rootId)
  }

  // Depth-first flatten
  const entries: ReadyEntry[] = []

  function walk(nodeId: number, depth: number): void {
    const node = nodes.get(nodeId)
    if (!node) return
    if (!node.isActionable && !node.hasActionableDescendant) return

    entries.push({
      node: node.node,
      type: node.type,
      title: node.title,
      status: node.status,
      depth,
      isCurrent: node.node.id === currentId,
    })

    for (const childId of node.children) {
      walk(childId, depth + 1)
    }
  }

  for (const rootId of roots) {
    walk(rootId, 0)
  }

  return { entries, warnings }
}

/**
 * Evaluate the `depends:` gate for a doc. Returns true when every
 * dependency that resolves to a doc classifies as done. Malformed
 * entries, group refs, and unresolvable IDs produce a warning and do
 * not gate.
 */
function evaluateDepends(
  project: ResolvedProject,
  scan: ReturnType<typeof scanNodes>,
  dependsValue: unknown,
  warnings: string[],
): boolean {
  const entries = parseDepends(dependsValue)
  let ok = true

  for (const entry of entries) {
    if (entry.id === null) {
      warnings.push(`Malformed depends entry: ${JSON.stringify(entry.raw)}`)
      continue
    }

    const target: Node | null = findNodeById(scan, entry.id)
    if (target === null) {
      warnings.push(`depends entry references missing node ${entry.id}`)
      continue
    }

    if (target.kind === "group") {
      warnings.push(
        `depends entry references group ${entry.id} (${target.slug}); groups cannot be depended on`,
      )
      continue
    }

    const targetInfo = loadDocInfo(target)
    const status =
      typeof targetInfo.frontmatter.status === "string"
        ? targetInfo.frontmatter.status
        : undefined
    const config = statusConfigFor(project, target.tag)
    if (classifyStatus(status, config) !== "done") {
      ok = false
    }
  }

  return ok
}
