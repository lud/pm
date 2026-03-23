import { command } from "cleye"
import { loadProjectFrom } from "../lib/project.js"
import { getStatusSummary } from "../core/listing.js"
import { showDocument } from "../core/documents.js"
import { getCurrentId } from "../core/current.js"
import { printShowResult } from "./show.js"
import * as cli from "../lib/cli.js"

export const statusCommand = command(
  {
    name: "status",
  },
  () => {
    const project = loadProjectFrom(process.cwd())

    // Status summary
    const summary = getStatusSummary(project)

    if (summary.length === 0) {
      cli.info("No documents found.")
    } else {
      for (const entry of summary) {
        cli.info(`${entry.doctype}: ${entry.open} open, ${entry.closed} closed`)
      }
    }

    // Current document
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
  },
)
