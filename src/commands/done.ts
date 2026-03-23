import { command } from "cleye"
import { loadProjectFrom } from "../lib/project.js"
import { markDone } from "../core/documents.js"
import { parseDocumentRef } from "../core/scanner.js"
import { formatPath } from "../lib/format.js"
import { touchCurrent } from "../core/current.js"
import * as cli from "../lib/cli.js"

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
      const doc = markDone(project, id)
      touchCurrent(project.projectDir)
      const displayPath = formatPath(doc.path, process.cwd())
      cli.success(`${displayPath} → ${doc.frontmatter.status}`)
    } catch (err) {
      cli.abortError((err as Error).message)
    }
  },
)
