import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import {
  type FrontmatterData,
  parseFrontmatter,
  prependFrontmatter,
  setFrontmatterProperties,
} from "../lib/frontmatter.js"
import { mkdirSyncOrAbort, writeFileSyncOrAbort } from "../lib/fs-helpers.js"
import type { ResolvedDoctype, ResolvedProject } from "../lib/project.js"
import { extractParentId, formatParentRef } from "./parent-ref.js"
import {
  type DocumentFile,
  findDocumentById,
  formatDocumentFilename,
  getNextId,
  scanDocuments,
} from "./scanner.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { DocumentFile } from "./scanner.js"

/**
 * A document file with parsed frontmatter (no body).
 * Frontmatter is normalized: status is string|undefined, parent is number|string|undefined.
 */
export type DocumentInfo = DocumentFile & {
  frontmatter: FrontmatterData
}

/**
 * A full document with frontmatter and body content.
 * Use DocumentInfo when the body is not needed.
 */
export type Document = DocumentInfo & {
  body: string
}

export type ShowResult = {
  document: DocumentInfo
  parents: DocumentInfo[]
  children: DocumentInfo[]
}

export type CreateResult = {
  id: number
  path: string
  doctype: ResolvedDoctype
}

// ---------------------------------------------------------------------------
// Read a document (with frontmatter)
// ---------------------------------------------------------------------------

export function readDocument(
  project: ResolvedProject,
  id: number,
): DocumentInfo | null {
  const scanned = findDocumentById(project, id)
  if (!scanned) return null
  return loadDocumentInfo(scanned)
}

export function loadDocumentInfo(file: DocumentFile): DocumentInfo {
  const content = readFileSync(file.path, "utf-8")
  const { data } = parseFrontmatter(content)
  return {
    ...file,
    frontmatter: data,
  }
}

export function loadDocument(file: DocumentFile): Document {
  const content = readFileSync(file.path, "utf-8")
  const { data, body } = parseFrontmatter(content)
  return {
    ...file,
    frontmatter: data,
    body,
  }
}

// ---------------------------------------------------------------------------
// Show: document + parents + children
// ---------------------------------------------------------------------------

export function showDocument(
  project: ResolvedProject,
  id: number,
): ShowResult | null {
  const doc = readDocument(project, id)
  if (!doc) return null

  // Walk up parent chain
  const parents: DocumentInfo[] = []
  let currentParentId = extractParentId(doc.frontmatter.parent)
  while (currentParentId !== null) {
    const parent = readDocument(project, currentParentId)
    if (!parent) break
    parents.unshift(parent) // prepend so root is first
    currentParentId = extractParentId(parent.frontmatter.parent)
  }

  // Find children (requires full scan)
  const children: DocumentInfo[] = []
  for (const file of scanDocuments(project)) {
    if (file.id === id) continue
    const child = loadDocumentInfo(file)
    if (extractParentId(child.frontmatter.parent) === id) {
      children.push(child)
    }
  }

  return { document: doc, parents, children }
}

// ---------------------------------------------------------------------------
// Create a new document
// ---------------------------------------------------------------------------

export function createDocument(
  project: ResolvedProject,
  doctypeName: string,
  title: string,
  options: {
    parentId?: number
    status?: string
    setProperties?: Record<string, unknown>
  } = {},
): CreateResult {
  const doctype = project.doctypes[doctypeName]
  if (!doctype) {
    throw new Error(`Unknown doctype: "${doctypeName}"`)
  }

  // Validate parent requirements
  let parentDoc: DocumentInfo | null = null
  if (doctype.parent !== undefined) {
    if (doctype.requireParent && options.parentId === undefined) {
      throw new Error(
        `Doctype "${doctypeName}" requires a parent of type "${doctype.parent}"`,
      )
    }
    if (options.parentId !== undefined) {
      parentDoc = readDocument(project, options.parentId)
      if (!parentDoc) {
        throw new Error(`Parent document ${options.parentId} not found`)
      }
      if (parentDoc.doctype.name !== doctype.parent) {
        throw new Error(
          `Parent document ${options.parentId} is a "${parentDoc.doctype.name}", expected "${doctype.parent}"`,
        )
      }
    }
  } else if (options.parentId !== undefined) {
    throw new Error(`Doctype "${doctypeName}" does not accept a parent`)
  }

  // Get next global ID
  const id = getNextId(project)

  // Generate slug from title
  const slug = slugify(title)

  // Determine target directory
  const targetDir = resolveTargetDirectory(project, doctype, options.parentId)

  // Build filename
  const filename = formatDocumentFilename(
    id,
    doctype.tag,
    slug,
    project.idPadWidth,
  )

  // Determine final path
  let filePath: string
  if (doctype.intermediateDir) {
    const dirName = `${filename.replace(/\.md$/, "")}`
    const intermediateDir = join(targetDir, dirName)
    mkdirSyncOrAbort(intermediateDir, { recursive: true })
    filePath = join(intermediateDir, filename)
  } else {
    mkdirSyncOrAbort(targetDir, { recursive: true })
    filePath = join(targetDir, filename)
  }

  // Build frontmatter — no `id` field (ID comes from filename)
  const status = options.status ?? doctype.defaultStatus
  const frontmatterData: Record<string, unknown> = {
    title,
    status,
    created_on: new Date().toISOString().slice(0, 10),
    ...options.setProperties,
  }
  if (parentDoc !== null) {
    frontmatterData.parent = formatParentRef(
      parentDoc.id,
      parentDoc.tag,
      parentDoc.slug,
    )
  }

  // Write file
  const content = prependFrontmatter(frontmatterData, "\n")
  writeFileSyncOrAbort(filePath, content)

  return { id, path: filePath, doctype }
}

// ---------------------------------------------------------------------------
// Edit a document's frontmatter
// ---------------------------------------------------------------------------

export function editDocument(
  project: ResolvedProject,
  id: number,
  options: {
    setParent?: number
    setProperties?: Record<string, unknown>
  },
): DocumentInfo {
  const doc = readDocument(project, id)
  if (!doc) {
    throw new Error(`Document ${id} not found`)
  }

  const updates: Record<string, unknown> = {}

  // Handle parent update
  if (options.setParent !== undefined) {
    const parentDoctype = doc.doctype.parent
    if (parentDoctype === undefined) {
      throw new Error(
        `Document ${id} is a "${doc.doctype.name}" which does not accept a parent`,
      )
    }
    const parentDoc = readDocument(project, options.setParent)
    if (!parentDoc) {
      throw new Error(`Parent document ${options.setParent} not found`)
    }
    if (parentDoc.doctype.name !== parentDoctype) {
      throw new Error(
        `Parent document ${options.setParent} is a "${parentDoc.doctype.name}", expected "${parentDoctype}"`,
      )
    }
    updates.parent = formatParentRef(
      parentDoc.id,
      parentDoc.tag,
      parentDoc.slug,
    )
  }

  // Handle property updates
  if (options.setProperties) {
    Object.assign(updates, options.setProperties)
  }

  if (Object.keys(updates).length === 0) {
    return doc
  }

  // Apply updates
  const content = readFileSync(doc.path, "utf-8")
  const newContent = setFrontmatterProperties(content, updates)
  writeFileSyncOrAbort(doc.path, newContent)

  // Return updated document
  return readDocument(project, id)!
}

// ---------------------------------------------------------------------------
// Mark document as done
// ---------------------------------------------------------------------------

export function markDone(project: ResolvedProject, id: number): DocumentInfo {
  const doc = readDocument(project, id)
  if (!doc) {
    throw new Error(`Document ${id} not found`)
  }

  const doneStatus = doc.doctype.doneStatuses[0]
  if (!doneStatus) {
    throw new Error(
      `Doctype "${doc.doctype.name}" has no done statuses defined`,
    )
  }

  return editDocument(project, id, {
    setProperties: { status: doneStatus },
  })
}

// ---------------------------------------------------------------------------
// Mark document as blocked
// ---------------------------------------------------------------------------

export function markBlocked(
  project: ResolvedProject,
  id: number,
): DocumentInfo {
  const doc = readDocument(project, id)
  if (!doc) {
    throw new Error(`Document ${id} not found`)
  }

  const blockedStatus = doc.doctype.blockedStatuses[0]
  if (!blockedStatus) {
    throw new Error(
      `Doctype "${doc.doctype.name}" has no blocked statuses defined`,
    )
  }

  return editDocument(project, id, {
    setProperties: { status: blockedStatus },
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Resolve the target directory for a new document based on its doctype
 * and optional parent.
 */
function resolveTargetDirectory(
  project: ResolvedProject,
  doctype: ResolvedDoctype,
  parentId?: number,
): string {
  let baseDir: string

  if (doctype.parent === undefined || parentId === undefined) {
    // No parent — resolve against project root
    baseDir = project.projectDir
  } else {
    // Has parent — resolve against parent's self directory
    const parentDoc = findDocumentById(project, parentId)
    if (!parentDoc) {
      throw new Error(`Parent document ${parentId} not found`)
    }
    baseDir = getSelfDirectory(parentDoc)
  }

  // Append doctype's dir
  if (doctype.dir === ".") {
    return baseDir
  }
  return join(baseDir, doctype.dir)
}

/**
 * Get the "self directory" of a document.
 * - If intermediateDir: the document's own named directory (which is the
 *   containing directory, since the file lives inside it).
 * - Otherwise: the document's containing directory (same as parent's self dir).
 *
 * In both cases we return dirname(doc.path), but the semantics differ:
 * for intermediateDir documents, this IS their own directory;
 * for non-intermediateDir documents, this is shared with their parent.
 */
function getSelfDirectory(doc: DocumentFile): string {
  return dirname(doc.path)
}
