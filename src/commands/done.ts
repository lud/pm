import { command } from "cleye"
import { touchCurrent } from "../core/current.js"
import { markDone } from "../core/documents.js"
import { parseDocumentRef } from "../core/scanner.js"
import * as cli from "../lib/cli.js"
import { formatPath } from "../lib/format.js"
import { loadProjectFrom } from "../lib/project.js"

export const doneCommand = command(
  {
    name: "done",
    parameters: ["<id>"],
  },
  (argv) => {
    const project = loadProjectFrom(process.cwd())
    const id = parseDocumentRef(argv._.id)
    if (id === null) {
      cli.abortError(`Invalid document ID: "${argv._.id}"`)
    }

    try {
      const { document, unblocked } = markDone(project, id)
      touchCurrent(project.projectDir)
      const cwd = process.cwd()
      const displayPath = formatPath(document.path, cwd)
      cli.success(`${displayPath} → ${document.frontmatter.status}`)

      for (const doc of unblocked) {
        const unblockedPath = formatPath(doc.path, cwd)
        cli.success(`${unblockedPath} → ${doc.frontmatter.status} (unblocked)`)
      }
    } catch (err) {
      cli.abortError((err as Error).message)
    }
  },
)
