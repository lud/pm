import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import type { ResolvedDoctype, ResolvedProject } from "../lib/project.js"

// ---------------------------------------------------------------------------
// Filename parsing
// ---------------------------------------------------------------------------

const FILENAME_REGEX = /^(\d+)\.([a-zA-Z][a-zA-Z0-9]*)\.(.+)\.md$/

export type ParsedFilename = {
  id: number
  tag: string
  slug: string
}

export function parseDocumentFilename(filename: string): ParsedFilename | null {
  const match = FILENAME_REGEX.exec(filename)
  if (!match) return null
  return {
    id: parseInt(match[1], 10),
    tag: match[2],
    slug: match[3],
  }
}

/**
 * Format a document filename with zero-padded ID.
 * Uses 3-digit padding by default (configurable via mask length).
 */
export function formatDocumentFilename(
  id: number,
  tag: string,
  slug: string,
  padWidth = 3,
): string {
  const paddedId = String(id).padStart(padWidth, "0")
  return `${paddedId}.${tag}.${slug}.md`
}

// ---------------------------------------------------------------------------
// Scanned document entry
// ---------------------------------------------------------------------------

export type DocumentFile = {
  id: number
  tag: string
  slug: string
  path: string
  extension: string
  doctype: ResolvedDoctype
}

// ---------------------------------------------------------------------------
// Scanner (generator)
// ---------------------------------------------------------------------------

/**
 * V1 simple scanner: find all root doctype directories and recursively scan
 * for document files. Yields lightweight entries without reading frontmatter.
 */
export function* scanDocuments(
  project: ResolvedProject,
): Generator<DocumentFile> {
  // Build tag -> doctype lookup
  const tagToDoctype = new Map<string, ResolvedDoctype>()
  for (const dt of Object.values(project.doctypes)) {
    tagToDoctype.set(dt.tag, dt)
  }

  // Find root directories: doctypes with no parent
  const rootDirs = new Set<string>()
  for (const dt of Object.values(project.doctypes)) {
    if (dt.parent === undefined) {
      rootDirs.add(dt.absDir)
    }
  }

  // Also add the project dir itself in case some doctypes resolve to "."
  // relative to the project root
  for (const dt of Object.values(project.doctypes)) {
    if (dt.parent === undefined) {
      rootDirs.add(dt.absDir)
    }
  }

  // Recursively scan each root directory
  for (const rootDir of rootDirs) {
    yield* scanDirectory(rootDir, tagToDoctype)
  }
}

function* scanDirectory(
  dir: string,
  tagToDoctype: Map<string, ResolvedDoctype>,
): Generator<DocumentFile> {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return // Directory doesn't exist or not readable — skip
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry)

    // Try to parse as a document file
    if (entry.endsWith(".md")) {
      const parsed = parseDocumentFilename(entry)
      if (parsed) {
        const doctype = tagToDoctype.get(parsed.tag)
        if (doctype) {
          yield {
            id: parsed.id,
            tag: parsed.tag,
            slug: parsed.slug,
            path: fullPath,
            extension: "md",
            doctype,
          }
        }
      }
    }

    // Recurse into directories
    try {
      const stat = statSync(fullPath)
      if (stat.isDirectory()) {
        yield* scanDirectory(fullPath, tagToDoctype)
      }
    } catch {
      // Can't stat — skip
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers that consume the scanner
// ---------------------------------------------------------------------------

/**
 * Find a document by its numeric ID.
 */
export function findDocumentById(
  project: ResolvedProject,
  id: number,
): DocumentFile | null {
  for (const doc of scanDocuments(project)) {
    if (doc.id === id) return doc
  }
  return null
}

/**
 * Collect all documents into an array (needed for operations like
 * finding the next ID or listing all documents).
 */
// TODO this function loads everything in memory. We should find call sites ande
// replace with scanDocuments if possible
export function collectAllDocuments(project: ResolvedProject): DocumentFile[] {
  return [...scanDocuments(project)]
}

/**
 * Get the next available global ID.
 */
export function getNextId(project: ResolvedProject): number {
  let maxId = 0
  for (const doc of scanDocuments(project)) {
    if (doc.id > maxId) maxId = doc.id
  }
  return maxId + 1
}

/**
 * Parse a document reference (string from CLI argument) into a numeric ID.
 * Accepts any integer with any number of leading zeroes.
 */
export function parseDocumentRef(ref: string): number | null {
  if (!/^\d+$/.test(ref)) return null
  const id = parseInt(ref, 10)
  if (id <= 0) return null
  return id
}
