import { command } from "cleye"
import { findDocumentById, parseDocumentRef } from "../core/scanner.js"
import * as cli from "../lib/cli.js"
import { formatPath } from "../lib/format.js"
import { loadProjectFrom } from "../lib/project.js"

export const whichCommand = command(
  {
    name: "which",
  },
  (argv) => {
    const project = loadProjectFrom(process.cwd())
    const ids = argv._ as string[]

    if (ids.length === 0) {
      cli.info(project.projectDir)
      return
    }

    for (const raw of ids) {
      const id = parseDocumentRef(raw)
      if (id === null) {
        cli.abortError(`Invalid document ID: "${raw}"`)
      }

      const doc = findDocumentById(project, id)
      if (!doc) {
        cli.abortError(`Document ${id} not found`)
      }

      cli.info(formatPath(doc.path, process.cwd()))
    }
  },
)
