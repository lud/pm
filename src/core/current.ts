import { readFileSync, unlinkSync, utimesSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const CURRENT_FILE = ".pm.current"

/**
 * Read the current document ID from `.pm.current`.
 * Returns null if the file doesn't exist or is empty.
 */
export function getCurrentId(projectDir: string): number | null {
  const filePath = join(projectDir, CURRENT_FILE)
  try {
    const content = readFileSync(filePath, "utf-8").trim()
    if (!content) return null
    const id = parseInt(content, 10)
    return Number.isNaN(id) || id <= 0 ? null : id
  } catch {
    return null
  }
}

/**
 * Set the current document ID in `.pm.current`.
 */
export function setCurrentId(projectDir: string, id: number): void {
  const filePath = join(projectDir, CURRENT_FILE)
  writeFileSync(filePath, `${String(id)}\n`)
}

/**
 * Clear the current document (remove `.pm.current`).
 */
export function clearCurrentId(projectDir: string): void {
  const filePath = join(projectDir, CURRENT_FILE)
  try {
    unlinkSync(filePath)
  } catch {
    // File doesn't exist — that's fine
  }
}

/**
 * Touch `.pm.current` to update its mtime (for future cache invalidation).
 */
export function touchCurrent(projectDir: string): void {
  const filePath = join(projectDir, CURRENT_FILE)
  try {
    const now = new Date()
    utimesSync(filePath, now, now)
  } catch {
    // File doesn't exist — that's fine
  }
}
