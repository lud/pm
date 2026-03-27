import { execSync } from "node:child_process"
import { command } from "cleye"
import { touchCurrent } from "../core/current.js"
import { createDocument } from "../core/documents.js"
import { parseDocumentRef } from "../core/scanner.js"
import * as cli from "../lib/cli.js"
import { formatPath } from "../lib/format.js"
import { loadProjectFrom } from "../lib/project.js"
import {
  flagsToRecord,
  parsePropertyFlag,
  type PropertyFlag,
  type PropertyValue,
} from "../lib/properties.js"

const RESERVED_NEW_PROPERTIES: Record<string, (s: PropertyValue) => string> = {
  id: () => "id is automatically generated",
  title: () => "title is created from the command arguments",
  status: (status: PropertyValue) => `use --status ${status}`,
  parent: (parent: PropertyValue) => `use --parent ${parent}`,
}

export const newCommand = command(
  {
    name: "new",
    parameters: ["<doctype>", "<title...>"],
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
      set: {
        type: [String],
        description: "Set frontmatter property: key:value",
      },
    },
  },
  (argv) => {
    const project = loadProjectFrom(process.cwd())
    const doctypeName = argv._.doctype
    const titleParts = argv._.title as unknown as string[]
    const title = titleParts.join(" ")

    let parentId: number | undefined
    if (argv.flags.parent) {
      parentId = parseDocumentRef(argv.flags.parent) ?? undefined
      if (parentId === undefined) {
        cli.abortError(`Invalid parent ID: "${argv.flags.parent}"`)
      }
    }

    let flags: PropertyFlag[]
    try {
      flags = (argv.flags.set ?? []).map((s) => parsePropertyFlag(s, "--set"))
    } catch (err) {
      cli.abortError((err as Error).message)
      return
    }

    const reservedErrors: string[] = []
    for (const flag of flags) {
      if (Object.hasOwn(RESERVED_NEW_PROPERTIES, flag.key)) {
        reservedErrors.push(
          `Cannot use "--set ${flag.raw}" with "new", ${RESERVED_NEW_PROPERTIES[flag.key](flag.value)}.`,
        )
      }
    }
    if (reservedErrors.length) cli.abortError(reservedErrors.join("\n"))

    const setProperties = flagsToRecord(flags)

    try {
      const result = createDocument(project, doctypeName, title, {
        parentId,
        status: argv.flags.status ?? undefined,
        setProperties:
          Object.keys(setProperties).length > 0 ? setProperties : undefined,
      })

      touchCurrent(project.projectDir)
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
