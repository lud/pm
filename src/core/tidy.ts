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

/**
 * Compute expected paths for all documents, processing parents before children
 * so that children resolve against the parent's expected (not current) path.
 *
 * Returns a map from document absolute path → expected absolute path.
 */
function computeAllExpectedPaths(
  docs: DocumentEntry[],
  project: ResolvedProject,
  docById: Map<number, DocumentEntry>,
  idRemapping: Map<string, number>,
): Map<string, string> {
  const result = new Map<string, string>()

  // Sort by depth (documents with no parent first, then their children, etc.)
  const sorted = topoSortByParent(docs, docById)

  for (const doc of sorted) {
    const doctype = doc.doctype
    const newId = idRemapping.get(doc.path) ?? doc.id
    const filename = formatDocumentFilename(
      newId,
      doc.tag,
      doc.slug,
      project.idPadWidth,
    )

    // Determine base directory
    let baseDir: string
    if (doctype.parent === undefined || doc.parentId === null) {
      baseDir = project.projectDir
    } else {
      const parentDoc = docById.get(doc.parentId)
      if (parentDoc) {
        // Use the parent's EXPECTED path to compute self directory
        const parentExpectedPath = result.get(parentDoc.path) ?? parentDoc.path
        baseDir = dirname(parentExpectedPath)
      } else {
        // Parent not found — orphan, keep current location
        result.set(doc.path, doc.path)
        continue
      }
    }

    // Append doctype's dir
    const targetDir = doctype.dir === "." ? baseDir : join(baseDir, doctype.dir)

    if (doctype.intermediateDir) {
      const dirName = filename.replace(/\.md$/, "")
      result.set(doc.path, join(targetDir, dirName, filename))
    } else {
      result.set(doc.path, join(targetDir, filename))
    }
  }

  return result
}

/**
 * Sort documents so that parents come before their children.
 */
function topoSortByParent(
  docs: DocumentEntry[],
  docById: Map<number, DocumentEntry>,
): DocumentEntry[] {
  const visited = new Set<string>()
  const sorted: DocumentEntry[] = []
  const docByPath = new Map(docs.map((d) => [d.path, d]))

  function visit(doc: DocumentEntry) {
    if (visited.has(doc.path)) return
    visited.add(doc.path)

    // Visit parent first
    if (doc.parentId !== null) {
      const parent = docById.get(doc.parentId)
      if (parent && docByPath.has(parent.path)) {
        visit(parent)
      }
    }

    sorted.push(doc)
  }

  for (const doc of docs) {
    visit(doc)
  }

  return sorted
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
  const expectedPaths = computeAllExpectedPaths(
    docs,
    project,
    docById,
    idRemapping,
  )
  const mappings: TidyMapping[] = []
  const moves: TidyMoveOp[] = []

  for (const doc of docs) {
    const newId = idRemapping.get(doc.path) ?? doc.id
    const expectedPath = expectedPaths.get(doc.path) ?? doc.path

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
      moves.push({ from: doc.path, to: expectedPath })
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

  // 2. Collect source directories that may become empty after moves
  const sourceDirs = new Set<string>()
  for (const move of plan.moves) {
    sourceDirs.add(dirname(move.from))
  }

  // 3. Move files: create target directory, rename file
  for (const move of plan.moves) {
    mkdirSyncOrAbort(dirname(move.to), { recursive: true })
    _renameSync(move.from, move.to)
  }

  // 4. Clean up empty source directories (bottom-up by path length)
  const sortedDirs = [...sourceDirs].sort((a, b) => b.length - a.length)
  for (const dir of sortedDirs) {
    tryRemoveEmptyDir(dir)
  }
}

function _renameSync(from: string, to: string): void {
  const { renameSync } = require("node:fs") as typeof import("node:fs")
  renameSync(from, to)
}

function tryRemoveEmptyDir(dir: string): void {
  const { readdirSync, rmdirSync } =
    require("node:fs") as typeof import("node:fs")
  try {
    const entries = readdirSync(dir)
    if (entries.length === 0) {
      rmdirSync(dir)
    }
  } catch {
    // Directory doesn't exist or can't be read — fine
  }
}
