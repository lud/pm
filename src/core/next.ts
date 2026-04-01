import type { ResolvedProject } from "../lib/project.js"
import { type DocumentInfo, loadDocumentInfo } from "./documents.js"
import { parseFrontmatterId } from "./parent-ref.js"
import { scanDocuments } from "./scanner.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GraphNode = {
  document: DocumentInfo
  parentId: number | null
  isAvailable: boolean
  children: number[]
}
export enum TraversalEventTypes {
  Start = "Start",
  Found = "Found",
  Exhausted = "Exhausted",
  Inspect = "Inspect",
  VisitChildren = "VisitChildren",
  VisitSiblings = "VisitSiblings",
  GoToParent = "GoToParent",
}

export type TraversalEvent =
  | {
      type: TraversalEventTypes.Inspect
      documentId: number
      document: DocumentInfo
    }
  | {
      type: TraversalEventTypes.Found
      documentId: number
      document: DocumentInfo
    }
  | {
      type: TraversalEventTypes.VisitChildren
      documentId: number
      childrenIds: number[]
    }
  | {
      type: TraversalEventTypes.VisitSiblings
      documentId: number
      siblingsIds: number[]
    }
  | {
      type: TraversalEventTypes.GoToParent
      documentId: number
      parentId: number
    }
  | { type: TraversalEventTypes.Exhausted }
  | {
      type: Exclude<
        TraversalEventTypes,
        | TraversalEventTypes.Inspect
        | TraversalEventTypes.VisitChildren
        | TraversalEventTypes.VisitSiblings
        | TraversalEventTypes.GoToParent
        | TraversalEventTypes.Exhausted
        | TraversalEventTypes.Found
      >
      documentId: number
    }

export type NextOptions = {
  onEvent?: (event: TraversalEvent) => void
}

// ---------------------------------------------------------------------------
// Build document graph
// ---------------------------------------------------------------------------

function buildGraph(
  project: ResolvedProject,
  currentId?: number,
): Map<number, GraphNode> {
  const nodes = new Map<number, GraphNode>()

  for (const file of scanDocuments(project)) {
    const doc = loadDocumentInfo(file)
    if (!doc.doctype.workflows && doc.id !== currentId) continue

    const status = doc.frontmatter.status as string | undefined
    const parentId = parseFrontmatterId(doc.frontmatter.parent)

    const isDone =
      status !== undefined && doc.doctype.doneStatuses.includes(status)
    const isBlocked =
      status !== undefined && doc.doctype.blockedStatuses.includes(status)

    nodes.set(doc.id, {
      document: doc,
      parentId,
      isAvailable: !isDone && !isBlocked,
      children: [],
    })
  }

  // Build children lists
  for (const node of nodes.values()) {
    if (node.parentId !== null) {
      const parent = nodes.get(node.parentId)
      if (parent) {
        parent.children.push(node.document.id)
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

function getParentChain(
  nodes: Map<number, GraphNode>,
  nodeId: number,
): number[] {
  let cursorId: number | null | undefined = nodeId
  const stack: number[] = []
  while (cursorId && nodes.has(cursorId)) {
    const node = nodes.get(cursorId)
    stack.unshift(cursorId)
    cursorId = node?.parentId
  }
  return stack
}

function getSiblings(
  nodes: Map<number, GraphNode>,
  cursorId: number,
  parentId: number | null,
  closedList: Set<number>,
  seenSiblings: Set<number>,
): number[] {
  if (parentId === null) {
    // Root level: siblings are all root nodes
    const roots: number[] = []
    for (const node of nodes.values()) {
      if (
        node.parentId === null &&
        node.document.id !== cursorId &&
        !closedList.has(node.document.id)
      ) {
        roots.push(node.document.id)
      }
    }
    return roots.sort((a, b) => a - b)
  } else {
    const parent = nodes.get(parentId)
    if (!parent) return []
    return parent.children
      .filter(
        (id) => !closedList.has(id) && !seenSiblings.has(id) && id !== cursorId,
      )
      .sort((a, b) => a - b)
  }
}

function getChildrenIds(
  nodes: Map<number, GraphNode>,
  parentId: number,
  ignoreSet: Set<number>,
) {
  const parent = nodes.get(parentId)
  if (!parent) return []
  return parent.children
    .filter((id) => !ignoreSet.has(id))
    .sort((a, b) => a - b)
}

function isLeaf(node: GraphNode): boolean {
  return node.children.length === 0
}

export function findNextDocument(
  project: ResolvedProject,
  currentId: number,
  options: NextOptions = {},
): DocumentInfo | null {
  const emit = options.onEvent ?? (() => {})
  const nodes = buildGraph(project, currentId)
  const stack = getParentChain(nodes, currentId)
  const closedList: Set<number> = new Set()
  const seenSiblings: Set<number> = new Set()
  const cursorIndex = 0

  const ctx = { stack, nodes, emit, cursorIndex, closedList, seenSiblings }

  ctx.emit({ type: TraversalEventTypes.Start, documentId: currentId })

  while (stack.length) {
    const cursorId = stack[stack.length - 1]

    if (ctx.closedList.has(cursorId)) {
      stack.pop()
      continue
    }

    const node = ctx.nodes.get(cursorId)
    if (!node) {
      continue // this should never happen
    }

    ctx.emit({
      type: TraversalEventTypes.Inspect,
      documentId: cursorId,
      document: node.document,
    })

    const childrenIds = getChildrenIds(ctx.nodes, cursorId, ctx.closedList)
    if (childrenIds.length) {
      ctx.emit({
        type: TraversalEventTypes.VisitChildren,
        documentId: cursorId,
        childrenIds,
      })
      addNewStack(ctx.stack, childrenIds.slice().reverse(), ctx.closedList)
      continue
    }

    ctx.closedList.add(cursorId)
    stack.pop()

    // No children of any status at this point. If there were children this is reached on the second iteration.
    if (node.isAvailable && isLeaf(node) && cursorId !== currentId) {
      ctx.emit({
        type: TraversalEventTypes.Found,
        documentId: cursorId,
        document: node.document,
      })
      return node.document
    }

    const siblingsIds = getSiblings(
      ctx.nodes,
      cursorId,
      node.parentId,
      ctx.closedList,
      ctx.seenSiblings,
    )

    if (siblingsIds.length) {
      ctx.emit({
        type: TraversalEventTypes.VisitSiblings,
        documentId: cursorId,
        siblingsIds,
      })

      for (const id of siblingsIds) {
        seenSiblings.add(id)
      }

      addNewStack(
        ctx.stack,
        // reverse to read from stack in order
        siblingsIds.slice().reverse(),
        ctx.closedList,
      )
    }
    if (
      typeof stack[stack.length - 1] === "number" &&
      stack[stack.length - 1] === node.parentId
    ) {
      ctx.emit({
        type: TraversalEventTypes.GoToParent,
        documentId: cursorId,
        parentId: node.parentId,
      })
    }
  }

  ctx.emit({ type: TraversalEventTypes.Exhausted })
  return null
}

function addNewStack(stack: number[], ids: number[], closedList: Set<number>) {
  for (const id of ids) {
    if (!closedList.has(id) && !stack.includes(id)) {
      stack.push(id)
    }
  }
}
