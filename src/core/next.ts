import { readFileSync } from "node:fs"
import { type FrontmatterData, parseFrontmatter } from "../lib/frontmatter.js"
import type { ResolvedDoctype, ResolvedProject } from "../lib/project.js"
import type { ShowResult } from "./documents.js"
import { extractParentId } from "./parent-ref.js"
import { collectAllDocuments } from "./scanner.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GraphNode = {
  id: number
  tag: string
  slug: string
  path: string
  doctype: ResolvedDoctype
  frontmatter: FrontmatterData
  parentId: number | null
  status: string | undefined
  title: string | undefined
  isAvailable: boolean
  children: number[]
}
export enum TraversalEventTypes {
  Start = "Start",
  VisitSiblings = "VisitSiblings",
  GoToParent = "GoToParent",
  VisitChildren = "VisitChildren",
  Found = "Found",
  NoAvailableChildren = "NoAvailableChildren",
  Exhausted = "Exhausted",
}

export type TraversalEvent =
  | { type: TraversalEventTypes.Start; currentId: number }
  | {
      type: TraversalEventTypes.VisitSiblings
      cursorId: number
      parentId: number | null
      candidates: number[]
    }
  | { type: TraversalEventTypes.GoToParent; from: number; parentId: number }
  | {
      type: TraversalEventTypes.VisitChildren
      cursorId: number
      candidates: number[]
    }
  | { type: TraversalEventTypes.Found; cursorId: number }
  | { type: TraversalEventTypes.NoAvailableChildren; cursorId: number }
  | { type: TraversalEventTypes.Exhausted }

export type NextOptions = {
  onEvent?: (event: TraversalEvent) => void
}

// ---------------------------------------------------------------------------
// Build document graph
// ---------------------------------------------------------------------------

function buildGraph(project: ResolvedProject): Map<number, GraphNode> {
  const nodes = new Map<number, GraphNode>()

  for (const scanned of collectAllDocuments(project)) {
    const content = readFileSync(scanned.path, "utf-8")
    const { data } = parseFrontmatter(content)
    const status = typeof data.status === "string" ? data.status : undefined
    const title = typeof data.title === "string" ? data.title : undefined
    const parentId = extractParentId(data.parent)

    const isDone =
      status !== undefined && scanned.doctype.doneStatuses.includes(status)
    const isBlocked =
      status !== undefined && scanned.doctype.blockedStatuses.includes(status)

    nodes.set(scanned.id, {
      id: scanned.id,
      tag: scanned.tag,
      slug: scanned.slug,
      path: scanned.path,
      doctype: scanned.doctype,
      frontmatter: data,
      parentId,
      status,
      title,
      isAvailable: !isDone && !isBlocked,
      children: [],
    })
  }

  // Build children lists
  for (const node of nodes.values()) {
    if (node.parentId !== null) {
      const parent = nodes.get(node.parentId)
      if (parent) {
        parent.children.push(node.id)
      }
    }
  }

  // Sort children by ID
  for (const node of nodes.values()) {
    node.children.sort((a, b) => a - b)
  }

  return nodes
}

// ---------------------------------------------------------------------------
// Core algorithm
// ---------------------------------------------------------------------------

function getSiblings(
  nodes: Map<number, GraphNode>,
  cursorId: number,
  parentId: number | null,
): number[] {
  if (parentId === null) {
    // Root level: siblings are all root nodes
    const roots: number[] = []
    for (const node of nodes.values()) {
      if (node.parentId === null && node.id !== cursorId) {
        roots.push(node.id)
      }
    }
    return roots.sort((a, b) => a - b)
  }

  const parent = nodes.get(parentId)
  if (!parent) return []
  return parent.children.filter((id) => id !== cursorId).sort((a, b) => a - b)
}

function isLeaf(nodes: Map<number, GraphNode>, id: number): boolean {
  const node = nodes.get(id)
  return node !== undefined && node.children.length === 0
}

export function findNextDocument(
  project: ResolvedProject,
  currentId: number,
  options: NextOptions = {},
): ShowResult | null {
  const emit = options.onEvent ?? (() => {})
  const nodes = buildGraph(project)
  const visited = new Set<number>()

  const currentNode = nodes.get(currentId)
  if (!currentNode) {
    return null
  }

  emit({ type: TraversalEventTypes.Start, currentId })
  visited.add(currentId)

  let cursorId = currentId

  // Main loop: find siblings, then drill into children or go up
  while (true) {
    const cursor = nodes.get(cursorId)!
    const parentId = cursor.parentId

    // Step 2: get available siblings
    const siblings = getSiblings(nodes, cursorId, parentId)
    const availableSiblings = siblings.filter(
      (id) => !visited.has(id) && nodes.get(id)!.isAvailable,
    )

    emit({
      type: TraversalEventTypes.VisitSiblings,
      cursorId,
      parentId,
      candidates: availableSiblings,
    })

    if (availableSiblings.length === 0) {
      // Step 3a: no sibling → go to parent
      if (parentId === null) {
        // We're at root level with no siblings → exhausted
        emit({ type: TraversalEventTypes.Exhausted })
        return null
      }

      emit({ type: TraversalEventTypes.GoToParent, from: cursorId, parentId })
      // Don't add parent to visited — we're just passing through
      cursorId = parentId
      continue
    }

    // Step 3b: pick first available sibling
    cursorId = availableSiblings[0]
    visited.add(cursorId)

    // Step 4/5/6: drill into children until we find a leaf
    while (true) {
      if (isLeaf(nodes, cursorId)) {
        // Step 4a: leaf found → return it
        emit({ type: TraversalEventTypes.Found, cursorId: cursorId })
        const node = nodes.get(cursorId)!
        const showResult: ShowResult = {
          document: {
            id: node.id,
            tag: node.tag,
            slug: node.slug,
            path: node.path,
            doctype: node.doctype,
            frontmatter: node.frontmatter,
            body: "",
          },
          // Unused for now so we do not scan them
          parents: [],
          children: [],
        }
        return showResult
      }

      // Has children — find available ones
      const childNode = nodes.get(cursorId)!
      const availableChildren = childNode.children.filter(
        (id) => !visited.has(id) && nodes.get(id)!.isAvailable,
      )

      emit({
        type: TraversalEventTypes.VisitChildren,
        cursorId,
        candidates: availableChildren,
      })

      if (availableChildren.length > 0) {
        // Step 6a: drill into first available child
        cursorId = availableChildren[0]
        visited.add(cursorId)
        continue
      }

      // Step 6b: cursor is a non-leaf with no available children → dead end
      emit({
        type: TraversalEventTypes.NoAvailableChildren,
        cursorId,
      })
      // Break inner loop to go back to step 2 (find siblings of cursor)
      break
    }
  }
}
