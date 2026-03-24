import { command } from "cleye"
import {
  clearCurrentId,
  getCurrentId,
  setCurrentId,
  touchCurrent,
} from "../core/current.js"
import { showDocument } from "../core/documents.js"
import { parseDocumentRef } from "../core/scanner.js"
import * as cli from "../lib/cli.js"
import { loadProjectFrom } from "../lib/project.js"
import {
  formatChildrenList,
  formatDocumentHeader,
  formatParentsList,
} from "./show.js"

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
      touchCurrent(project.projectDir)
    } else {
      // Show current document
      id = getCurrentId(project.projectDir)
      if (id === null) {
        cli.info(
          "No current document set.\nUse: `pm current <id>` to set a current document.",
        )
        return
      }
    }

    const result = showDocument(project, id)
    if (!result) {
      cli.warning(`Current document ${id} not found. Clearing.`)
      clearCurrentId(project.projectDir)
      return
    }

    const fmtId = project.formatId
    const cwd = process.cwd()
    cli.info(formatDocumentHeader(result.document, cwd, fmtId))
    if (result.parents.length > 0) {
      cli.info("")
      cli.info(formatParentsList(result.parents, fmtId))
    }
    if (result.children.length > 0) {
      cli.info("")
      cli.info(formatChildrenList(result.children, fmtId))
    }
  },
)
