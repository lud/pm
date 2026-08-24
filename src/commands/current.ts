import { command } from "cleye"
import { loadProjectFrom, type ResolvedProject } from "../core/config.js"
import {
  clearCurrentId,
  getCurrentId,
  setCurrentId,
  touchCurrent,
} from "../core/current.js"
import { type ShowResult, showNode } from "../core/docs.js"
import { parseRefId } from "../core/refs.js"
import * as cli from "../lib/cli.js"
import { displayShowResult } from "./show.js"

export const currentCommand = command(
  {
    name: "current",
    parameters: ["[id]"],
  },
  (argv) => {
    let project: ResolvedProject
    try {
      project = loadProjectFrom(process.cwd())
    } catch (err) {
      cli.abortError((err as Error).message)
    }

    let id: number | null

    if (argv._.id) {
      // Set current node — a doc or a group
      id = parseRefId(argv._.id)
      if (id === null) {
        cli.abortError(`Invalid document ID: "${argv._.id}"`)
      }
      setCurrentId(project.projectDir, id)
      touchCurrent(project.projectDir)
    } else {
      // Show current node
      id = getCurrentId(project.projectDir)
      if (id === null) {
        cli.info(
          "No current document set.\nUse: `pm current <id>` to set a current document.",
        )
        return
      }
    }

    let result: ShowResult | null
    try {
      result = showNode(project, id)
    } catch (err) {
      cli.abortError((err as Error).message)
    }

    if (!result) {
      cli.warning(`Current document ${id} not found. Clearing.`)
      clearCurrentId(project.projectDir)
      return
    }

    displayShowResult(project, result, process.cwd())
  },
)
