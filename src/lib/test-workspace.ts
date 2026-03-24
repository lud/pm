import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll } from "vitest"

/**
 * Create a temporary workspace directory for tests that need to mutate files.
 * Registers an `afterAll` hook to clean up automatically.
 */
export function createTestWorkspace(label: string) {
  const root = mkdtempSync(join(tmpdir(), `pm-test-${label}-`))
  let counter = 0

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  return {
    /** The root temporary directory path. */
    root,

    /** Create an empty unique subdirectory inside the workspace. */
    dir(name?: string): string {
      const dirName = name ?? `dir-${++counter}`
      const path = join(root, dirName)
      mkdirSync(path, { recursive: true })
      return path
    },
  }
}
