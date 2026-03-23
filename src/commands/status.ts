import { command } from "cleye"
import table from "text-table"
import { loadProjectFrom } from "../lib/project.js"
import { getStatusSummary, type StatusSummary } from "../core/listing.js"
import { showDocument } from "../core/documents.js"
import { getCurrentId } from "../core/current.js"
import { printShowResult } from "./show.js"
import * as cli from "../lib/cli.js"

function formatStatusSummary(summary: StatusSummary[]): string {
  const blocks: string[] = []

  for (const entry of summary) {
    blocks.push(`${entry.doctype}: ${entry.active} active, ${entry.done} done`)

    if (entry.statuses.length > 0) {
      const rows = entry.statuses.map((s) => [`  ${s.status}`, String(s.count)])
      blocks.push(table(rows, { align: ["l", "r"], hsep: "  " }))
    }
  }

  return blocks.join("\n")
}

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
      cli.info(formatStatusSummary(summary))
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
