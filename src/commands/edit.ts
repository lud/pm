import { command } from "cleye"
import { touchCurrent } from "../core/current.js"
import { editDocument } from "../core/documents.js"
import { parseDocumentRef } from "../core/scanner.js"
import * as cli from "../lib/cli.js"
import { formatPath } from "../lib/format.js"
import { loadProjectFrom } from "../lib/project.js"
import { parsePropertyFlags } from "../lib/properties.js"

export const editCommand = command(
  {
    name: "edit",
    parameters: ["<id>"],
    flags: {
      parent: {
        type: String,
        alias: "p",
        description: "Set parent document ID",
      },
      set: {
        type: [String],
        description: "Set frontmatter property: key:value",
      },
    },
  },
  (argv) => {
    const project = loadProjectFrom(process.cwd())
    const id = parseDocumentRef(argv._.id)
    if (id === null) {
      cli.abortError(`Invalid document ID: "${argv._.id}"`)
    }

    let properties: Record<string, unknown>
    try {
      properties = parsePropertyFlags(argv.flags.set, "--set")
    } catch (err) {
      cli.abortError((err as Error).message)
      return
    }

    let setParent: number | undefined
    if (argv.flags.parent) {
      setParent = parseDocumentRef(argv.flags.parent) ?? undefined
      if (setParent === undefined) {
        cli.abortError(`Invalid parent ID: "${argv.flags.parent}"`)
      }

      if (Object.hasOwn(properties, "parent")) {
        cli.abortError(
          'Cannot combine --parent with --set parent:... on "edit"',
        )
      }
    }

    try {
      const doc = editDocument(project, id, {
        setParent,
        setProperties:
          Object.keys(properties).length > 0 ? properties : undefined,
      })

      touchCurrent(project.projectDir)
      const displayPath = formatPath(doc.path, process.cwd())
      cli.success(`Updated ${displayPath}`)
    } catch (err) {
      cli.abortError((err as Error).message)
    }
  },
)
