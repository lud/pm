import { basename } from "node:path"
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
    const onEvent = argv.flags.verbose ? makeVerboseLogger(fmtId) : undefined

    const result = findNextDocument(project, currentId, { onEvent })

    if (!result) {
      cli.info("No next document found.")
      return
    }

    if (argv.flags.verbose) cli.writeln("")

    cli.info(formatDocumentHeader(result, process.cwd(), fmtId))
  },
)

function makeVerboseLogger(
  fmtId: (id: number) => string,
): (e: TraversalEvent) => void {
  const seenIds = new Set<number>()
  const announcedChildIds = new Set<number>()

  return (e: TraversalEvent) => {
    const msg = formatEvent(e, fmtId, seenIds, announcedChildIds)
    if (msg) cli.info(msg)
  }
}

function formatEvent(
  e: TraversalEvent,
  fmtId: (id: number) => string,
  seenIds: Set<number>,
  announcedChildIds: Set<number>,
): string | undefined {
  switch (e.type) {
    case TraversalEventTypes.Start:
      return undefined
    case TraversalEventTypes.Inspect: {
      const firstTime = !seenIds.has(e.documentId)
      seenIds.add(e.documentId)
      const filename = basename(e.document.path)
      if (firstTime) {
        const status = e.document.frontmatter.status as string | undefined
        const statusStr = status !== undefined ? ` (${status})` : "(no status)"
        return `inspect ${filename}${statusStr}`
      }
      return undefined
    }
    case TraversalEventTypes.VisitChildren: {
      for (const id of e.childrenIds) announcedChildIds.add(id)
      const ids = e.childrenIds.map(fmtId).join(", ")
      const plural = e.childrenIds.length > 1
      return `discovered ${e.childrenIds.length} child${plural ? "ren" : ""} under ${fmtId(e.documentId)}: ${ids}`
    }
    case TraversalEventTypes.VisitSiblings: {
      const newSiblings = e.siblingsIds.filter(
        (id) => !announcedChildIds.has(id),
      )
      if (newSiblings.length === 0) return undefined
      const ids = newSiblings.map(fmtId).join(", ")
      const plural = newSiblings.length > 1
      return `discovered ${newSiblings.length} sibling${plural ? "s" : ""} of ${fmtId(e.documentId)}: ${ids}`
    }
    case TraversalEventTypes.GoToParent:
      return undefined
    case TraversalEventTypes.Found: {
      const filename = basename(e.document.path)
      const status = e.document.frontmatter.status as string | undefined
      const statusStr = status !== undefined ? ` (${status})` : "(no status)"
      return `found ${fmtId(e.documentId)} ${filename}${statusStr}`
    }

    case TraversalEventTypes.Exhausted:
      return undefined
  }
}
