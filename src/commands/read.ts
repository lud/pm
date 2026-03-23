import { command } from "cleye"
import { readFileSync } from "node:fs"
import { loadProjectFrom } from "../lib/project.js"
import { findDocumentById, parseDocumentRef } from "../core/scanner.js"
import * as cli from "../lib/cli.js"

export const readCommand = command(
  {
    name: "read",
    parameters: ["<id>"],
  },
  (argv) => {
    const project = loadProjectFrom(process.cwd())
    const id = parseDocumentRef(argv._.id)
    if (id === null) {
      cli.abortError(`Invalid document ID: "${argv._.id}"`)
    }

    const doc = findDocumentById(project, id)
    if (!doc) {
      cli.abortError(`Document ${id} not found`)
    }

    const content = readFileSync(doc.path, "utf-8")
    cli.write(content)
  },
)
