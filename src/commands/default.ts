import * as cli from "../lib/cli.js"
import { loadProjectFile, tryLocateProjectFile } from "../lib/project.js"
import { runStatusDisplay } from "./status.js"

/**
 * Default command when `pm` is run with no arguments.
 * Shows project status if a project is found, otherwise suggests `pm init`.
 */
export function runDefaultCommand(): void {
  const projectFile = tryLocateProjectFile(process.cwd())
  if (projectFile === null) {
    cli.info("No .pm.json found. Run `pm init` to create a project.")
    return
  }

  const project = loadProjectFile(projectFile)
  runStatusDisplay(project)
}
