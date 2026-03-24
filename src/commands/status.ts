import { command } from "cleye"
import table from "text-table"
import { getCurrentId } from "../core/current.js"
import { showDocument } from "../core/documents.js"
import { getStatusSummary, type StatusSummary } from "../core/listing.js"
import * as cli from "../lib/cli.js"
import type { ResolvedProject } from "../lib/project.js"
import { loadProjectFrom } from "../lib/project.js"
import { displayDocumentRelations, formatDocumentHeader } from "./show.js"

function formatStatusMarker(s: {
  status: string
  isDone: boolean
  isBlocked: boolean
}): string {
  if (s.isDone && s.status !== "done") return " [done]"
  if (s.isBlocked && s.status !== "blocked") return " [blocked]"
  return ""
}

function formatStatusSummary(summary: StatusSummary[]): string {
  const blocks: string[] = []

  const rows = []
  for (const entry of summary) {
    // blocks.push(`${entry.doctype}:`)
    rows.push([entry.doctype])

    if (entry.statuses.length > 0) {
      entry.statuses.forEach((s) => {
        rows.push([
          "",
          `  ${s.status}${formatStatusMarker(s)}`,
          String(s.count),
        ])
      })
    }
  }
  blocks.push("Status breakdown:")
  blocks.push(table(rows, { align: ["l", "l", "r"], hsep: "  " }))

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
      const fmtId = project.formatId
      cli.info(formatDocumentHeader(result.document, process.cwd(), fmtId))
      displayDocumentRelations(result, fmtId)
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
