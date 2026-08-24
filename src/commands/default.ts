import { loadProjectFile, tryLocateProjectFile } from "../core/config.js"
import * as cli from "../lib/cli.js"
import { runStatusDisplay } from "./status.js"

/**
 * Default command when `pm` is run with no arguments.
 * Shows project status if a project is found, otherwise suggests `pm init`.
 */
export function runDefaultCommand(): void {
  const projectFile = tryLocateProjectFile(process.cwd())
  if (projectFile === null) {
    cli.info("No pm.json found. Run `pm init` to create a project.")
    return
  }

  try {
    const project = loadProjectFile(projectFile)
    runStatusDisplay(project)
  } catch (err) {
    cli.abortError((err as Error).message)
  }
}
