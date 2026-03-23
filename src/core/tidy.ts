import { readFileSync } from "node:fs"
import { rename as renameAsync } from "node:fs/promises"
import { join, dirname } from "node:path"
import { parseFrontmatter, prependFrontmatter } from "../lib/frontmatter.js"
import { writeFileSyncOrAbort, mkdirSyncOrAbort } from "../lib/fs-helpers.js"
import type { ResolvedProject, ResolvedDoctype } from "../lib/project.js"
import {
  collectAllDocuments,
  formatDocumentFilename,
  type ScannedDocument,
} from "./scanner.js"
import {
  formatParentRef,
  extractParentId,
  parseParentRef,
} from "./parent-ref.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DocumentEntry = ScannedDocument & {
  frontmatter: Record<string, unknown>
  body: string
  parentId: number | null
}

export type TidyMapping = {
  doc: DocumentEntry
  newId: number
  newPath: string
  idChanged: boolean
  pathChanged: boolean
}

export type TidyEditOp = {
  /** Path to edit (before any moves) */
  path: string
  /** New parent ref string to write */
  newParentRef: string
}

export type TidyMoveOp = {
  from: string
  to: string
  /** If the source has intermediateDir, the directory to rename */
  fromDir?: string
  toDir?: string
}

export type TidyPlan = {
  mappings: TidyMapping[]
  edits: TidyEditOp[]
  moves: TidyMoveOp[]
  duplicateGroups: Map<number, DocumentEntry[]>
  orphans: DocumentEntry[]
}

// ---------------------------------------------------------------------------
// Prompt interface (injected by CLI, mockable in tests)
// ---------------------------------------------------------------------------

export type ParentPrompt = (
  doc: DocumentEntry,
  candidates: DocumentEntry[],
) => Promise<DocumentEntry | null>

// ---------------------------------------------------------------------------
// Scan and build full document entries
// ---------------------------------------------------------------------------

function loadAllDocuments(project: ResolvedProject): DocumentEntry[] {
  const scanned = collectAllDocuments(project)
  return scanned.map((s) => {
    const content = readFileSync(s.path, "utf-8")
    const { data, body } = parseFrontmatter(content)
    return {
      ...s,
      frontmatter: data,
      body,
      parentId: extractParentId(data.parent),
    }
  })
}

// ---------------------------------------------------------------------------
// Step 1: Detect duplicates
// ---------------------------------------------------------------------------

function findDuplicates(docs: DocumentEntry[]): Map<number, DocumentEntry[]> {
  const byId = new Map<number, DocumentEntry[]>()
  for (const doc of docs) {
    const group = byId.get(doc.id) ?? []
    group.push(doc)
    byId.set(doc.id, group)
  }

  const duplicates = new Map<number, DocumentEntry[]>()
  for (const [id, group] of byId) {
    if (group.length > 1) {
      // Sort deterministically by absolute path — first keeps the ID
      group.sort((a, b) => a.path.localeCompare(b.path))
      duplicates.set(id, group)
    }
  }
  return duplicates
}

// ---------------------------------------------------------------------------
// Step 2: Build ID mapping (handle duplicates)
// ---------------------------------------------------------------------------

function buildIdMapping(
  docs: DocumentEntry[],
  duplicates: Map<number, DocumentEntry[]>,
): Map<string, number> {
  // Map from absolute path → new ID
  const pathToNewId = new Map<string, number>()

  // Find current max ID
  let maxId = 0
  for (const doc of docs) {
    if (doc.id > maxId) maxId = doc.id
  }

  // For each duplicate group, first keeps ID, others get new IDs
  for (const [_id, group] of duplicates) {
    for (let i = 1; i < group.length; i++) {
      maxId++
      pathToNewId.set(group[i].path, maxId)
    }
  }

  return pathToNewId
}

// ---------------------------------------------------------------------------
// Step 3: Compute expected paths (relocations)
// ---------------------------------------------------------------------------

function computeExpectedPath(
  doc: DocumentEntry,
  project: ResolvedProject,
  docById: Map<number, DocumentEntry>,
  idRemapping: Map<string, number>,
): string {
  const doctype = doc.doctype

  // Determine base directory
  let baseDir: string
  if (doctype.parent === undefined || doc.parentId === null) {
    baseDir = project.projectDir
  } else {
    // Resolve parent — use the remapped ID if the parent was remapped
    const parentDoc = docById.get(doc.parentId)
    if (parentDoc) {
      baseDir = getSelfDirectory(parentDoc)
    } else {
      // Parent not found — orphan case, keep current location
      return doc.path
    }
  }

  // Append doctype's dir
  const targetDir = doctype.dir === "." ? baseDir : join(baseDir, doctype.dir)

  // Compute filename with potentially new ID
  const newId = idRemapping.get(doc.path) ?? doc.id
  const filename = formatDocumentFilename(newId, doc.tag, doc.slug)

  if (doctype.intermediateDir) {
    const dirName = filename.replace(/\.md$/, "")
    return join(targetDir, dirName, filename)
  }
  return join(targetDir, filename)
}

function getSelfDirectory(doc: DocumentEntry): string {
  return dirname(doc.path)
}

// ---------------------------------------------------------------------------
// Step 4: Detect orphans
// ---------------------------------------------------------------------------

function findOrphans(
  docs: DocumentEntry[],
  idSet: Set<number>,
): DocumentEntry[] {
  return docs.filter((doc) => doc.parentId !== null && !idSet.has(doc.parentId))
}

// ---------------------------------------------------------------------------
// Step 5: Resolve parent references for children of duplicates
// ---------------------------------------------------------------------------

function resolveParentForChild(
  child: DocumentEntry,
  duplicateGroup: DocumentEntry[],
): DocumentEntry | null {
  // Try to match by slug hint from the parent ref
  const parentRefStr = child.frontmatter.parent
  if (typeof parentRefStr === "string") {
    const ref = parseParentRef(parentRefStr)
    if (ref) {
      const match = duplicateGroup.find(
        (d) => d.tag === ref.tag && d.slug === ref.slug,
      )
      if (match) return match
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Build the tidy plan
// ---------------------------------------------------------------------------

export async function buildTidyPlan(
  project: ResolvedProject,
  promptForParent?: ParentPrompt,
): Promise<TidyPlan> {
  const docs = loadAllDocuments(project)
  const duplicates = findDuplicates(docs)
  const idRemapping = buildIdMapping(docs, duplicates)

  // Build a lookup by ID (using original IDs, first-wins for duplicates)
  const docById = new Map<number, DocumentEntry>()
  for (const doc of docs) {
    if (!docById.has(doc.id)) {
      docById.set(doc.id, doc)
    }
  }

  // All known IDs (original)
  const allIds = new Set(docs.map((d) => d.id))

  // Detect orphans
  const orphans = findOrphans(docs, allIds)

  // Build edits for children of duplicate IDs
  const edits: TidyEditOp[] = []

  // For each duplicate group, resolve children's parent references
  for (const [dupId, group] of duplicates) {
    // Find all children referencing this duplicate ID
    const children = docs.filter((d) => d.parentId === dupId)

    for (const child of children) {
      // Try auto-resolve using slug hint
      let resolvedParent = resolveParentForChild(child, group)

      // If ambiguous, prompt
      if (!resolvedParent && promptForParent) {
        resolvedParent = await promptForParent(child, group)
      }

      if (resolvedParent) {
        const newParentId =
          idRemapping.get(resolvedParent.path) ?? resolvedParent.id
        const newRef = formatParentRef(
          newParentId,
          resolvedParent.tag,
          resolvedParent.slug,
        )
        // Only add edit if the ref actually changes
        const currentRef = child.frontmatter.parent
        if (currentRef !== newRef) {
          edits.push({ path: child.path, newParentRef: newRef })
        }
      }
    }
  }

  // Also update parent refs for documents whose parent got a new ID
  for (const doc of docs) {
    if (doc.parentId === null) continue
    // Skip documents already handled above (children of duplicates)
    if (edits.some((e) => e.path === doc.path)) continue

    const parent = docById.get(doc.parentId)
    if (!parent) continue

    const parentNewId = idRemapping.get(parent.path)
    if (parentNewId !== undefined) {
      // Parent's ID changed — update the child's parent ref
      const newRef = formatParentRef(parentNewId, parent.tag, parent.slug)
      edits.push({ path: doc.path, newParentRef: newRef })
    }
  }

  // Build mappings and detect relocations
  const mappings: TidyMapping[] = []
  const moves: TidyMoveOp[] = []

  for (const doc of docs) {
    const newId = idRemapping.get(doc.path) ?? doc.id
    const expectedPath = computeExpectedPath(doc, project, docById, idRemapping)

    const idChanged = newId !== doc.id
    const pathChanged = expectedPath !== doc.path

    mappings.push({
      doc,
      newId,
      newPath: expectedPath,
      idChanged,
      pathChanged,
    })

    if (pathChanged) {
      if (doc.doctype.intermediateDir) {
        moves.push({
          from: doc.path,
          to: expectedPath,
          fromDir: dirname(doc.path),
          toDir: dirname(expectedPath),
        })
      } else {
        moves.push({ from: doc.path, to: expectedPath })
      }
    }
  }

  return { mappings, edits, moves, duplicateGroups: duplicates, orphans }
}

// ---------------------------------------------------------------------------
// Apply the plan
// ---------------------------------------------------------------------------

export function applyTidyPlan(plan: TidyPlan): void {
  // 1. Edit files first (at their current paths)
  for (const edit of plan.edits) {
    const content = readFileSync(edit.path, "utf-8")
    const { data, body } = parseFrontmatter(content)
    data.parent = edit.newParentRef
    const newContent = prependFrontmatter(data, body)
    writeFileSyncOrAbort(edit.path, newContent)
  }

  // 2. Rename files that got new IDs (update frontmatter-adjacent filename)
  // This is handled by the moves — a file with a new ID will have a new path

  // 3. Move/relocate files
  for (const move of plan.moves) {
    if (move.fromDir && move.toDir) {
      // intermediateDir: rename the whole directory
      mkdirSyncOrAbort(dirname(move.toDir), { recursive: true })
      renameSync(move.fromDir, move.toDir)
    } else {
      mkdirSyncOrAbort(dirname(move.to), { recursive: true })
      renameSync(move.from, move.to)
    }
  }
}

// Sync rename wrapper
function renameSync(from: string, to: string): void {
  const { renameSync: _rename } = require("node:fs")
  _rename(from, to)
}
