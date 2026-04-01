import { command } from "cleye"
import { touchCurrent } from "../core/current.js"
import { markBlocked } from "../core/documents.js"
import { parseDocumentRef } from "../core/scanner.js"
import * as cli from "../lib/cli.js"
import { formatPath } from "../lib/format.js"
import { loadProjectFrom } from "../lib/project.js"

export const blockedCommand = command(
  {
    name: "blocked",
    parameters: ["<id>"],
    flags: {
      by: {
        type: String,
        description: "ID of the blocking document",
      },
    },
  },
  (argv) => {
    const project = loadProjectFrom(process.cwd())
    const id = parseDocumentRef(argv._.id)
    if (id === null) {
      cli.abortError(`Invalid document ID: "${argv._.id}"`)
    }

    let blockedBy: number | undefined
    if (argv.flags.by) {
      blockedBy = parseDocumentRef(argv.flags.by) ?? undefined
      if (blockedBy === undefined) {
        cli.abortError(`Invalid document ID: "${argv.flags.by}"`)
      }
    }

    try {
      const doc = markBlocked(project, id, { blockedBy })
      touchCurrent(project.projectDir)
      const displayPath = formatPath(doc.path, process.cwd())
      cli.success(`${displayPath} → ${doc.frontmatter.status}`)
      if (blockedBy === undefined) {
        cli.info("Tip: use --by <id> to reference the blocking document")
      }
    } catch (err) {
      cli.abortError((err as Error).message)
    }
  },
)
