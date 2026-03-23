import { command } from "cleye"
import { loadProjectFrom } from "../lib/project.js"
import { editDocument } from "../core/documents.js"
import { parseDocumentRef } from "../core/scanner.js"
import { formatPath } from "../lib/format.js"
import * as cli from "../lib/cli.js"

export const editCommand = command(
  {
    name: "edit",
    parameters: ["<id>", "[properties...]"],
    flags: {
      parent: {
        type: String,
        alias: "p",
        description: "Set parent document ID",
      },
    },
  },
  (argv) => {
    const project = loadProjectFrom(process.cwd())
    const id = parseDocumentRef(argv._.id)
    if (id === null) {
      cli.abortError(`Invalid document ID: "${argv._.id}"`)
    }

    const properties: Record<string, unknown> = {}

    // Parse key:value pairs from positional arguments
    for (const arg of argv._.properties) {
      const colonIdx = arg.indexOf(":")
      if (colonIdx === -1) {
        cli.abortError(`Invalid property format: "${arg}". Expected key:value`)
      }
      const key = arg.slice(0, colonIdx)
      const value = arg.slice(colonIdx + 1)
      properties[key] = value
    }

    let setParent: number | undefined
    if (argv.flags.parent) {
      setParent = parseDocumentRef(argv.flags.parent) ?? undefined
      if (setParent === undefined) {
        cli.abortError(`Invalid parent ID: "${argv.flags.parent}"`)
      }
    }

    try {
      const doc = editDocument(project, id, {
        setParent,
        setProperties: Object.keys(properties).length > 0 ? properties : undefined,
      })

      const displayPath = formatPath(doc.path, process.cwd())
      cli.success(`Updated ${displayPath}`)
    } catch (err) {
      cli.abortError((err as Error).message)
    }
  },
)
