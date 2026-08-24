import { dirname, join } from "node:path"
import {
  type FrontmatterData,
  parseFrontmatter,
  prependFrontmatter,
  setFrontmatterProperties,
} from "../lib/frontmatter.js"
import {
  mkdirSyncOrThrow,
  readFileSyncOrThrow,
  renameSyncOrThrow,
  writeFileSyncOrThrow,
} from "../lib/fs-helpers.js"
import { findType, type ResolvedProject, type ResolvedType } from "./config.js"
import {
  type DocNode,
  findNodeById,
  formatDocFilename,
  type GroupNode,
  maxNodeId,
  type ScanResult,
  scanNodes,
} from "./nodes.js"
import { formatDocRef, formatGroupRef, parseRefId } from "./refs.js"

/**
 * Documents core.
 *
 * Placement rules — frontmatter is authoritative, location is derived:
 *   - parent is a doc   → colocate: same directory as the parent doc
 *   - parent is a group → inside the group directory
 *   - no parent         → root of the project directory
 *
 * All functions throw plain Errors; the CLI shell maps to abortError.
 * Filesystem access goes through the OrThrow helpers in lib/fs-helpers.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A scanned doc with parsed frontmatter (no body). */
export type DocInfo = DocNode & {
  frontmatter: FrontmatterData
}

/** A full document with body content. */
export type Doc = DocInfo & {
  bodyRaw: string
  bodyWithoutFM: () => string
}

/** Parent chain entry: a doc, or the group that terminates the chain
 * (groups have no parents). */
export type ParentChainEntry = DocInfo | GroupNode

export type ShowDocResult = {
  kind: "doc"
  document: DocInfo
  /** Root first; a group can only be the first entry. */
  parents: ParentChainEntry[]
  /** Docs whose parent ref resolves to this doc, path order. */
  children: DocInfo[]
  /** Set when the parent chain hits an unresolvable ID. */
  missingParent?: number
}

export type ShowGroupResult = {
  kind: "group"
  group: GroupNode
  /** Docs whose parent ref resolves to this group, path order. */
  children: DocInfo[]
}

export type ShowResult = ShowDocResult | ShowGroupResult

export type CreateResult = {
  id: number
  path: string
  type: ResolvedType
}

export type EditResult = {
  document: DocInfo
  renamed?: { from: string; to: string }
}

export type MarkDoneResult = {
  document: DocInfo
  unblocked: DocInfo[]
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/** Read a doc's frontmatter. */
export function loadDocInfo(node: DocNode): DocInfo {
  const content = readFileSyncOrThrow(node.path, "utf-8")
  const { data } = parseFrontmatter(content)
  return { ...node, frontmatter: data }
}

/** Read a doc with its body. */
export function loadDoc(node: DocNode): Doc {
  const content = readFileSyncOrThrow(node.path, "utf-8")
  const { data, bodyRaw, bodyWithoutFM } = parseFrontmatter(content)
  return { ...node, frontmatter: data, bodyRaw, bodyWithoutFM }
}

/** Scan and read one doc by ID (doc wins over group on shared IDs). */
export function readDocument(
  project: ResolvedProject,
  id: number,
): DocInfo | null {
  const scan = scanNodes(project)
  const node = findNodeById(scan, id)
  if (node === null || node.kind !== "doc") return null
  return loadDocInfo(node)
}

// ---------------------------------------------------------------------------
// Show
// ---------------------------------------------------------------------------

/**
 * Show a node by ID: the doc (or group) plus its parent chain and
 * children. Returns null when the ID resolves to nothing.
 */
export function showNode(
  project: ResolvedProject,
  id: number,
): ShowResult | null {
  const scan = scanNodes(project)
  const node = findNodeById(scan, id)
  if (node === null) return null

  if (node.kind === "group") {
    return {
      kind: "group",
      group: node,
      children: findChildren(scan, node.id),
    }
  }

  const document = loadDocInfo(node)
  const parents: ParentChainEntry[] = []
  let missingParent: number | undefined
  let current: DocInfo = document

  while (true) {
    const parentId = parseRefId(current.frontmatter.parent)
    if (parentId === null) break

    const parentNode = findNodeById(scan, parentId)
    if (parentNode === null) {
      missingParent = parentId
      break
    }

    if (parentNode.kind === "group") {
      parents.push(parentNode)
      break
    }

    const parentInfo = loadDocInfo(parentNode)
    parents.push(parentInfo)
    current = parentInfo
  }
  parents.reverse()

  return {
    kind: "doc",
    document,
    parents,
    children: findChildren(scan, node.id),
    ...(missingParent !== undefined ? { missingParent } : {}),
  }
}

function findChildren(scan: ScanResult, parentId: number): DocInfo[] {
  const children: DocInfo[] = []
  for (const node of scan.docs) {
    const info = loadDocInfo(node)
    if (parseRefId(info.frontmatter.parent) === parentId) children.push(info)
  }
  return children
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Create a document.
 *
 * - `type` is a type name or tag (shared namespace); unknown → throw.
 * - ID is maxNodeId + 1 (docs and groups share the sequence).
 * - Slug derives from the title.
 * - Placement follows the rules above; `parentId` may name a doc or a
 *   group (unknown ID → throw). The written `parent:` ref is qualified
 *   (`{id}.{tag}.{slug}` for docs, `{id}.{slug}` for groups), padded with
 *   the project's formatId.
 * - Frontmatter: title, status (`status` option, else the type's
 *   defaultStatus), created_on (YYYY-MM-DD today), then setProperties,
 *   then parent.
 */
export function createDocument(
  project: ResolvedProject,
  options: {
    type: string
    title: string
    parentId?: number
    status?: string
    setProperties?: Record<string, unknown>
  },
): CreateResult {
  const type = findType(project, options.type)
  if (type === null) throw new Error(`Unknown type "${options.type}"`)
  if (options.title.trim() === "") throw new Error("Title must not be empty")

  const scan = scanNodes(project)
  const id = maxNodeId(scan) + 1
  const slug = slugify(options.title)

  let dir: string
  let parentRef: string | undefined
  if (options.parentId !== undefined) {
    const parentNode = findNodeById(scan, options.parentId)
    if (parentNode === null) {
      throw new Error(`Parent ${options.parentId} not found`)
    }
    if (parentNode.kind === "group") {
      dir = parentNode.path
      parentRef = formatGroupRef(
        parentNode.id,
        parentNode.slug,
        project.formatId,
      )
    } else {
      dir = dirname(parentNode.path)
      parentRef = formatDocRef(
        parentNode.id,
        parentNode.tag,
        parentNode.slug,
        project.formatId,
      )
    }
  } else {
    dir = project.rootDir
  }

  const filename = formatDocFilename(id, type.tag, slug, project.formatId)
  const path = join(dir, filename)

  const frontmatter: FrontmatterData = {
    title: options.title,
    status: options.status ?? type.defaultStatus,
    created_on: new Date().toISOString().slice(0, 10),
    ...(options.setProperties ?? {}),
  }
  if (parentRef !== undefined) frontmatter.parent = parentRef

  mkdirSyncOrThrow(dir, { recursive: true })
  writeFileSyncOrThrow(path, prependFrontmatter(frontmatter, "\n"))

  return { id, path, type }
}

// ---------------------------------------------------------------------------
// Edit
// ---------------------------------------------------------------------------

/**
 * Edit a document.
 *
 * - `setParent`: write a qualified ref to the doc or group with that ID
 *   (unknown → throw). Frontmatter only — location is healed by tidy.
 * - `setType`: rename the file's tag segment in place (name or tag,
 *   unknown → throw). Reported in `renamed`.
 * - `setProperties`: merge into frontmatter (empty/blank title → throw).
 * - `updateSlug`: rename the file so its slug matches the current title
 *   AND move it to its expected directory per the placement rules.
 *   Reported in `renamed`.
 */
export function editDocument(
  project: ResolvedProject,
  id: number,
  options: {
    setParent?: number
    setType?: string
    setProperties?: Record<string, unknown>
    updateSlug?: boolean
  },
): EditResult {
  const scan = scanNodes(project)
  const node = findNodeById(scan, id)
  if (node === null || node.kind !== "doc") {
    throw new Error(`Document ${id} not found`)
  }

  if (
    options.setParent === undefined &&
    options.setType === undefined &&
    options.setProperties === undefined &&
    !options.updateSlug
  ) {
    return { document: loadDocInfo(node) }
  }

  const originalPath = node.path
  let content = readFileSyncOrThrow(originalPath, "utf-8")

  if (options.setParent !== undefined) {
    const parentNode = findNodeById(scan, options.setParent)
    if (parentNode === null) {
      throw new Error(`Parent ${options.setParent} not found`)
    }
    const ref =
      parentNode.kind === "group"
        ? formatGroupRef(parentNode.id, parentNode.slug, project.formatId)
        : formatDocRef(
            parentNode.id,
            parentNode.tag,
            parentNode.slug,
            project.formatId,
          )
    content = setFrontmatterProperties(content, { parent: ref })
  }

  if (options.setProperties !== undefined) {
    if ("title" in options.setProperties) {
      const title = options.setProperties.title
      if (typeof title !== "string" || title.trim() === "") {
        throw new Error("Title must not be empty")
      }
    }
    content = setFrontmatterProperties(content, options.setProperties)
  }

  let tag = node.tag
  if (options.setType !== undefined) {
    const type = findType(project, options.setType)
    if (type === null) throw new Error(`Unknown type "${options.setType}"`)
    tag = type.tag
  }

  let finalPath: string
  if (options.updateSlug) {
    const { data } = parseFrontmatter(content)
    const tempInfo: DocInfo = {
      kind: "doc",
      id: node.id,
      tag,
      slug: node.slug,
      path: originalPath,
      groupId: node.groupId,
      frontmatter: data,
    }
    finalPath = computeExpectedPath(project, tempInfo, scan)
  } else {
    finalPath = join(
      dirname(originalPath),
      formatDocFilename(node.id, tag, node.slug, project.formatId),
    )
  }

  writeFileSyncOrThrow(originalPath, content)

  let renamed: { from: string; to: string } | undefined
  if (finalPath !== originalPath) {
    mkdirSyncOrThrow(dirname(finalPath), { recursive: true })
    renameSyncOrThrow(originalPath, finalPath)
    renamed = { from: originalPath, to: finalPath }
  }

  const finalScan = scanNodes(project)
  const finalNode = findNodeById(finalScan, node.id) as DocNode
  const document = loadDocInfo(finalNode)

  return { document, renamed }
}

// ---------------------------------------------------------------------------
// Done / blocked
// ---------------------------------------------------------------------------

/**
 * Set a doc's status to the first done status of its type (unknown tag →
 * the global statuses). Then unblock every doc whose `blocked_by`
 * resolves to this ID: remove `blocked_by`, reset status to that doc's
 * defaultStatus. A group ID → throw (groups have no status).
 */
export function markDone(project: ResolvedProject, id: number): MarkDoneResult {
  const scan = scanNodes(project)
  const node = findNodeById(scan, id)
  if (node === null) throw new Error(`Document ${id} not found`)
  if (node.kind === "group") {
    throw new Error(`Document ${id} is a group; groups have no status`)
  }

  const doc = loadDoc(node)
  const type = findType(project, node.tag)
  const doneStatus = (type ?? project.statuses).doneStatuses[0]
  const doneFrontmatter = { ...doc.frontmatter, status: doneStatus }
  writeFileSyncOrThrow(
    node.path,
    prependFrontmatter(doneFrontmatter, doc.bodyWithoutFM()),
  )

  const unblocked: DocInfo[] = []
  for (const other of scan.docs) {
    if (other.id === node.id) continue
    const otherDoc = loadDoc(other)
    if (parseRefId(otherDoc.frontmatter.blocked_by) !== node.id) continue

    const otherType = findType(project, other.tag)
    const newStatus = (otherType ?? project.statuses).defaultStatus
    const { blocked_by, ...rest } = otherDoc.frontmatter
    const newFrontmatter = { ...rest, status: newStatus }
    writeFileSyncOrThrow(
      other.path,
      prependFrontmatter(newFrontmatter, otherDoc.bodyWithoutFM()),
    )
    unblocked.push({ ...other, frontmatter: newFrontmatter })
  }

  return {
    document: { ...node, frontmatter: doneFrontmatter },
    unblocked,
  }
}

/**
 * Set a doc's status to the first blocked status of its type. With
 * `blockedBy`, also write a qualified `blocked_by` ref (doc or group ID —
 * groups are valid blockers; unknown → throw).
 */
export function markBlocked(
  project: ResolvedProject,
  id: number,
  options?: { blockedBy?: number },
): DocInfo {
  const scan = scanNodes(project)
  const node = findNodeById(scan, id)
  if (node === null || node.kind !== "doc") {
    throw new Error(`Document ${id} not found`)
  }

  const doc = loadDoc(node)
  const type = findType(project, node.tag)
  const blockedStatus = (type ?? project.statuses).blockedStatuses[0]

  const updates: Record<string, unknown> = { status: blockedStatus }
  if (options?.blockedBy !== undefined) {
    const blockerNode = findNodeById(scan, options.blockedBy)
    if (blockerNode === null) {
      throw new Error(`Blocking node ${options.blockedBy} not found`)
    }
    updates.blocked_by =
      blockerNode.kind === "group"
        ? formatGroupRef(blockerNode.id, blockerNode.slug, project.formatId)
        : formatDocRef(
            blockerNode.id,
            blockerNode.tag,
            blockerNode.slug,
            project.formatId,
          )
  }

  const newFrontmatter = { ...doc.frontmatter, ...updates }
  writeFileSyncOrThrow(
    node.path,
    prependFrontmatter(newFrontmatter, doc.bodyWithoutFM()),
  )

  return { ...node, frontmatter: newFrontmatter }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Expected absolute path of a doc per the placement rules, given the
 * scan it was found in. Used by updateSlug now, tidy later.
 */
export function computeExpectedPath(
  project: ResolvedProject,
  doc: DocInfo,
  scan: ScanResult,
): string {
  const title = doc.frontmatter.title
  const slug =
    typeof title === "string" && title.trim() !== "" && slugify(title) !== ""
      ? slugify(title)
      : doc.slug
  const filename = formatDocFilename(doc.id, doc.tag, slug, project.formatId)

  const parentId = parseRefId(doc.frontmatter.parent)
  if (parentId === null) {
    if (doc.frontmatter.parent === undefined) {
      return join(project.rootDir, filename)
    }
    return join(dirname(doc.path), filename)
  }

  const parentNode = findNodeById(scan, parentId)
  if (parentNode === null) {
    return join(dirname(doc.path), filename)
  }

  return parentNode.kind === "group"
    ? join(parentNode.path, filename)
    : join(dirname(parentNode.path), filename)
}
