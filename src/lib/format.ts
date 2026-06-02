import { isAbsolute, relative } from "node:path"

/**
 * Format a path for display: relative to CWD if it's a child of CWD,
 * otherwise absolute.
 */
export function formatPath(path: string, cwd: string): string {
  if (!isAbsolute(path)) return path
  const rel = relative(cwd, path)
  if (rel.startsWith("..") || isAbsolute(rel)) return path
  return rel || "."
}

/**
 * Format an unmissable separator header introducing a document's content.
 * Used when printing several documents in one stream (`pm context`, `pm read`).
 */
export function formatContentSeparator(label: string): string {
  const prefix = `== CONTENT OF ${label} `
  const width = Math.max(70, prefix.length + 1)
  return prefix.padEnd(width, "=")
}
