import { readFileSync } from "node:fs"
import { basename } from "node:path"
import { command } from "cleye"
import { findDocumentById, parseDocumentRef } from "../core/scanner.js"
import * as cli from "../lib/cli.js"
import { formatContentSeparator } from "../lib/format.js"
import { loadProjectFrom } from "../lib/project.js"

export const readCommand = command(
  {
    name: "read",
    parameters: ["<id...>"],
  },
  (argv) => {
    const project = loadProjectFrom(process.cwd())
    const raws = argv._.id as string[]

    // Resolve every ID up front so a bad/missing ID aborts before any output.
    const docs = raws.map((raw) => {
      const id = parseDocumentRef(raw)
      if (id === null) {
        cli.abortError(`Invalid document ID: "${raw}"`)
      }
      const doc = findDocumentById(project, id)
      if (!doc) {
        cli.abortError(`Document ${id} not found`)
      }
      return doc
    })

    const withHeaders = docs.length > 1
    docs.forEach((doc, index) => {
      const content = readFileSync(doc.path, "utf-8")
      if (withHeaders) {
        if (index > 0) cli.info("")
        cli.info(formatContentSeparator(basename(doc.path)))
        cli.info("")
      }
      cli.write(content)
    })
  },
)
