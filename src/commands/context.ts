import { basename } from "node:path"
import { command } from "cleye"
import {
  type ChainEntry,
  type Document,
  documentChain,
  showDocument,
} from "../core/documents.js"
import { parseDocumentRef } from "../core/scanner.js"
import * as cli from "../lib/cli.js"
import { loadProjectFrom } from "../lib/project.js"
import { displayDocumentRelations, formatDocumentHeader } from "./show.js"

export const contextCommand = command(
  {
    name: "context",
    parameters: ["<id>"],
  },
  (argv) => {
    const project = loadProjectFrom(process.cwd())
    const id = parseDocumentRef(argv._.id)
    if (id === null) {
      cli.abortError(`Invalid document ID: "${argv._.id}"`)
    }

    try {
      const result = showDocument(project, id)
      if (!result) {
        cli.abortError(`Document ${id} not found`)
      }

      const chain = documentChain(project, id)!

      // Show block (same as pm show)
      const fmtId = project.formatId
      const cwd = process.cwd()
      cli.info(formatDocumentHeader(result.document, cwd, fmtId))
      displayDocumentRelations(result, fmtId)

      // Document contents (top → bottom order, which is how chain is ordered)
      for (const entry of chain) {
        cli.info("")
        if (!isResolved(entry)) {
          cli.info(
            formatContentSeparator(`document ${fmtId(entry.id)} not found`),
          )
        } else {
          cli.info(formatContentSeparator(basename(entry.path)))
          cli.info("")
          cli.write(entry.bodyRaw)
        }
      }
    } catch (err) {
      cli.abortError((err as Error).message)
    }
  },
)

function isResolved(entry: ChainEntry): entry is Document {
  return !("resolved" in entry && entry.resolved === false)
}

export function formatContentSeparator(label: string): string {
  const prefix = `== CONTENT OF ${label} `
  const width = Math.max(70, prefix.length + 1)
  return prefix.padEnd(width, "=")
}
