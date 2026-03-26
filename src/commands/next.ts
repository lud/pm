import { command } from "cleye"
import { getCurrentId } from "../core/current.js"
import { readDocument } from "../core/documents.js"
import {
  findNextDocument,
  type TraversalEvent,
  TraversalEventTypes,
} from "../core/next.js"
import * as cli from "../lib/cli.js"
import { loadProjectFrom } from "../lib/project.js"
import { formatDocumentHeader } from "./show.js"

export const nextCommand = command(
  {
    name: "next",
    flags: {
      verbose: {
        type: Boolean,
        alias: "v",
        description: "Show traversal steps",
        default: false,
      },
    },
  },
  (argv) => {
    const project = loadProjectFrom(process.cwd())
    const currentId = getCurrentId(project.projectDir)

    if (currentId === null) {
      cli.abortError(
        "No current document set. Use `pm current $id` to set one.",
      )
    }

    // Verify current document exists
    const currentDoc = readDocument(project, currentId)
    if (!currentDoc) {
      cli.abortError(`Current document ${currentId} not found.`)
    }

    const fmtId = project.formatId
    const onEvent = argv.flags.verbose
      ? (e: TraversalEvent) => logEvent(e, fmtId)
      : undefined

    const result = findNextDocument(project, currentId, { onEvent })

    if (!result) {
      cli.info("No next document found.")
      return
    }

    cli.info(formatDocumentHeader(result, process.cwd(), fmtId))
  },
)

function logEvent(e: TraversalEvent, fmtId: (id: number) => string) {
  const msg = logMessage(e, fmtId)
  if (msg) cli.info(msg)
}

function logMessage(
  e: TraversalEvent,
  fmtId: (id: number) => string,
): string | undefined {
  switch (e.type) {
    case TraversalEventTypes.Start:
      return `---\nDecision log:\n  Starting from current document ${fmtId(e.currentId)}`
    case TraversalEventTypes.VisitSiblings:
      return `  Looking for available siblings of ${fmtId(e.cursorId)}`
    case TraversalEventTypes.GoToParent:
      return `  Moving to parent ${fmtId(e.parentId)}`
    case TraversalEventTypes.VisitChildren:
      return `  Looking for children under ${fmtId(e.cursorId)}`
    case TraversalEventTypes.NoAvailableChildren:
      return `  No available children under ${fmtId(e.cursorId)}`
    case TraversalEventTypes.Found:
      return `  Settled on ${fmtId(e.cursorId)}\n---`
    default:
  }
}
