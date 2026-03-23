import { tryLocateProjectFile, loadProjectFile } from "../lib/project.js"
import { getStatusSummary } from "../core/listing.js"
import { showDocument } from "../core/documents.js"
import { getCurrentId } from "../core/current.js"
import { printShowResult } from "./show.js"
import * as cli from "../lib/cli.js"

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

  const summary = getStatusSummary(project)

  if (summary.length === 0) {
    cli.info("No documents found.")
  } else {
    for (const entry of summary) {
      cli.info(`${entry.doctype}: ${entry.active} active, ${entry.done} done`)
    }
  }

  const currentId = getCurrentId(project.projectDir)
  if (currentId !== null) {
    cli.info("")
    cli.info("Current document:")
    const result = showDocument(project, currentId)
    if (result) {
      printShowResult(result, process.cwd())
    } else {
      cli.warning(`Current document ${currentId} not found`)
    }
  }
}
