import { readFileSync } from "node:fs"
import { parseFrontmatter } from "../lib/frontmatter.js"
import type { ResolvedProject } from "../lib/project.js"
import { classifyStatus } from "./listing.js"
import { parseFrontmatterId } from "./parent-ref.js"
import type { DocumentFile } from "./scanner.js"
import { scanDocuments } from "./scanner.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NextTreeEntry = {
  document: DocumentFile
  doctypeName: string
  title: string
  status: string | undefined
  depth: number
  isCurrent: boolean
}

export type NextTreeOptions = {
  withBlocked?: boolean
}

type TreeNode = {
  document: DocumentFile
  doctypeName: string
  title: string
  status: string | undefined
  parentId: number | null
  children: number[]
  isActionable: boolean
  hasActionableDescendant: boolean
}

// ---------------------------------------------------------------------------
// Build actionable tree
// ---------------------------------------------------------------------------

export function buildNextTree(
  project: ResolvedProject,
  currentId: number | null,
  options: NextTreeOptions = {},
): NextTreeEntry[] {
  const nodes = new Map<number, TreeNode>()

  // Step 1: Scan all documents, build node map
  for (const doc of scanDocuments(project)) {
    if (!doc.doctype.workflows) continue

    const content = readFileSync(doc.path, "utf-8")
    const { data } = parseFrontmatter(content)
    const status = data.status as string | undefined
    const title = typeof data.title === "string" ? data.title : doc.slug
    const parentId = parseFrontmatterId(data.parent)

    // Step 2: Classify actionability
    const category = classifyStatus(status, doc.doctype)
    const isActionable = options.withBlocked
      ? category !== "done"
      : category === "active"

    nodes.set(doc.id, {
      document: doc,
      doctypeName: doc.doctype.name,
      title,
      status,
      parentId,
      children: [],
      isActionable,
      hasActionableDescendant: false,
    })
  }

  // Step 3: Build parent-child links
  for (const node of nodes.values()) {
    if (node.parentId !== null) {
      const parent = nodes.get(node.parentId)
      if (parent) {
        parent.children.push(node.document.id)
      }
    }
  }
  for (const node of nodes.values()) {
    node.children.sort((a, b) => a - b)
  }

  // Step 4: Bottom-up pass — mark hasActionableDescendant
  const roots: number[] = []
  for (const node of nodes.values()) {
    if (node.parentId === null || !nodes.has(node.parentId)) {
      roots.push(node.document.id)
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

  // Step 5: Depth-first flatten
  const result: NextTreeEntry[] = []

  function walk(nodeId: number, depth: number): void {
    const node = nodes.get(nodeId)
    if (!node) return
    if (!node.isActionable && !node.hasActionableDescendant) return

    result.push({
      document: node.document,
      doctypeName: node.doctypeName,
      title: node.title,
      status: node.status,
      depth,
      isCurrent: node.document.id === currentId,
    })

    for (const childId of node.children) {
      walk(childId, depth + 1)
    }
  }

  for (const rootId of roots) {
    walk(rootId, 0)
  }

  return result
}
