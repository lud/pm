import { command } from "cleye"
import { loadProjectFrom, type ResolvedProject } from "../core/config.js"
import { findNodeById, type ScanResult, scanNodes } from "../core/nodes.js"
import { parseRefId } from "../core/refs.js"
import * as cli from "../lib/cli.js"
import { formatPath } from "../lib/format.js"

export const whichCommand = command(
  {
    name: "which",
  },
  (argv) => {
    const cwd = process.cwd()

    let project: ResolvedProject
    try {
      project = loadProjectFrom(cwd)
    } catch (err) {
      cli.abortError((err as Error).message)
    }

    const ids = argv._ as string[]

    if (ids.length === 0) {
      cli.info(project.projectDir)
      return
    }

    let scan: ScanResult
    try {
      scan = scanNodes(project)
    } catch (err) {
      cli.abortError((err as Error).message)
    }

    for (const raw of ids) {
      const id = parseRefId(raw)
      if (id === null) {
        cli.abortError(`Invalid document ID: "${raw}"`)
      }

      const node = findNodeById(scan, id)
      if (!node) {
        cli.abortError(`Document ${id} not found`)
      }

      cli.info(formatPath(node.path, cwd))
    }
  },
)
