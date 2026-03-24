import { command } from "cleye"
import table from "text-table"
import { loadProjectFrom } from "../lib/project.js"
import { getStatusSummary, type StatusSummary } from "../core/listing.js"
import { showDocument } from "../core/documents.js"
import { getCurrentId } from "../core/current.js"
import { printShowResult } from "./show.js"
import type { ResolvedProject } from "../lib/project.js"
import * as cli from "../lib/cli.js"

function formatStatusSummary(summary: StatusSummary[]): string {
  const blocks: string[] = []

  for (const entry of summary) {
    const parts = [`${entry.active} active`]
    if (entry.blocked > 0) parts.push(`${entry.blocked} blocked`)
    parts.push(`${entry.done} done`)
    blocks.push(`${entry.doctype}: ${parts.join(", ")}`)

    if (entry.statuses.length > 0) {
      const rows = entry.statuses.map((s) => {
        const marker = s.isBlocked ? " [blocked]" : s.isDone ? " [done]" : ""
        return [`  ${s.status}${marker}`, String(s.count)]
      })
      blocks.push(table(rows, { align: ["l", "r"], hsep: "  " }))
    }
  }

  return blocks.join("\n")
}

export function runStatusDisplay(project: ResolvedProject): void {
  const summary = getStatusSummary(project)

  if (summary.length === 0) {
    cli.info("No documents found.")
  } else {
    cli.info(formatStatusSummary(summary))
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

export const statusCommand = command(
  {
    name: "status",
  },
  () => {
    const project = loadProjectFrom(process.cwd())
    runStatusDisplay(project)
  },
)
