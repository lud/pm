import { relative, isAbsolute } from "node:path"

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
