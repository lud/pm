import { command } from "cleye"
import { loadProjectFrom } from "../lib/project.js"
import { createDocument } from "../core/documents.js"
import { parseDocumentRef } from "../core/scanner.js"
import { formatPath } from "../lib/format.js"
import * as cli from "../lib/cli.js"
import { execSync } from "node:child_process"

export const newCommand = command(
  {
    name: "new",
    parameters: ["<doctype>", "<title>"],
    flags: {
      parent: {
        type: String,
        alias: "p",
        description: "Parent document ID",
      },
      editor: {
        type: Boolean,
        alias: "e",
        description: "Open in editor after creation",
        default: false,
      },
      status: {
        type: String,
        alias: "s",
        description: "Initial status (overrides default)",
      },
    },
  },
  (argv) => {
    const project = loadProjectFrom(process.cwd())
    const doctypeName = argv._.doctype
    const title = argv._.title

    let parentId: number | undefined
    if (argv.flags.parent) {
      parentId = parseDocumentRef(argv.flags.parent) ?? undefined
      if (parentId === undefined) {
        cli.abortError(`Invalid parent ID: "${argv.flags.parent}"`)
      }
    }

    try {
      const result = createDocument(project, doctypeName, title, {
        parentId,
        status: argv.flags.status ?? undefined,
      })

      const displayPath = formatPath(result.path, process.cwd())
      cli.success(`Created ${displayPath}`)

      if (argv.flags.editor) {
        const editor = process.env.PM_EDITOR ?? process.env.EDITOR
        if (editor) {
          execSync(`${editor} "${result.path}"`, { stdio: "inherit" })
        } else {
          cli.warning("No editor configured. Set $PM_EDITOR or $EDITOR.")
        }
      }
    } catch (err) {
      cli.abortError((err as Error).message)
    }
  },
)
