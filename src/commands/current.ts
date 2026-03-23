import { command } from "cleye"
import { loadProjectFrom } from "../lib/project.js"
import { showDocument } from "../core/documents.js"
import { parseDocumentRef } from "../core/scanner.js"
import { getCurrentId, setCurrentId } from "../core/current.js"
import { printShowResult } from "./show.js"
import * as cli from "../lib/cli.js"

export const currentCommand = command(
  {
    name: "current",
    parameters: ["[id]"],
  },
  (argv) => {
    const project = loadProjectFrom(process.cwd())

    let id: number | null

    if (argv._.id) {
      // Set current document
      id = parseDocumentRef(argv._.id)
      if (id === null) {
        cli.abortError(`Invalid document ID: "${argv._.id}"`)
      }
      setCurrentId(project.projectDir, id)
    } else {
      // Show current document
      id = getCurrentId(project.projectDir)
      if (id === null) {
        cli.info("No current document set. Use: pm current <id>")
        return
      }
    }

    const result = showDocument(project, id)
    if (!result) {
      cli.warning(`Current document ${id} not found. Clearing.`)
      // Don't clear here — user might want to investigate
      return
    }

    printShowResult(result, process.cwd())
  },
)
