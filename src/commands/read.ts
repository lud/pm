import { basename } from "node:path"
import { command } from "cleye"
import { loadProjectFrom, type ResolvedProject } from "../core/config.js"
import {
  type DocNode,
  findNodeById,
  type ScanResult,
  scanNodes,
} from "../core/nodes.js"
import { parseRefId } from "../core/refs.js"
import * as cli from "../lib/cli.js"
import { formatContentSeparator } from "../lib/format.js"
import { readFileSyncOrThrow } from "../lib/fs-helpers.js"

export const readCommand = command(
  {
    name: "read",
    parameters: ["<id...>"],
  },
  (argv) => {
    let project: ResolvedProject
    try {
      project = loadProjectFrom(process.cwd())
    } catch (err) {
      cli.abortError((err as Error).message)
    }

    const raws = argv._.id as string[]

    let scan: ScanResult
    try {
      scan = scanNodes(project)
    } catch (err) {
      cli.abortError((err as Error).message)
    }

    // Resolve every ID up front so a bad/missing/group ID aborts before any output.
    const docs: DocNode[] = raws.map((raw) => {
      const id = parseRefId(raw)
      if (id === null) {
        cli.abortError(`Invalid document ID: "${raw}"`)
      }

      const node = findNodeById(scan, id)
      if (!node) {
        cli.abortError(`Document ${id} not found`)
      }

      if (node.kind === "group") {
        cli.abortError(`Node ${id} is a group directory, not a document`)
      }

      return node
    })

    const withHeaders = docs.length > 1
    docs.forEach((doc, index) => {
      let content: string
      try {
        content = readFileSyncOrThrow(doc.path, "utf-8")
      } catch (err) {
        cli.abortError((err as Error).message)
      }

      if (withHeaders) {
        if (index > 0) cli.info("")
        cli.info(formatContentSeparator(basename(doc.path)))
        cli.info("")
      }
      cli.write(content)
    })
  },
)
