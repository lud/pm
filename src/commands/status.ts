import { command } from "cleye"
import table from "text-table"
import { loadProjectFrom, type ResolvedProject } from "../core/config.js"
import { getCurrentId } from "../core/current.js"
import { showNode } from "../core/docs.js"
import { getStatusSummary, type StatusSummary } from "../core/list.js"
import * as cli from "../lib/cli.js"
import { displayShowResult } from "./show.js"

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
    rows.push([entry.type])

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
  for (const warning of project.warnings) {
    cli.warning(warning)
  }

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
    const result = showNode(project, currentId)
    if (result) {
      displayShowResult(project, result, process.cwd())
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
    let project: ResolvedProject
    try {
      project = loadProjectFrom(process.cwd())
    } catch (err) {
      cli.abortError((err as Error).message)
    }
    runStatusDisplay(project)
  },
)
