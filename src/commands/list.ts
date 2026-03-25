import { command } from "cleye"
import { type ListOptions, listDocuments } from "../core/listing.js"
import { parseDocumentRef } from "../core/scanner.js"
import * as cli from "../lib/cli.js"
import { loadProjectFrom } from "../lib/project.js"
import { parsePropertyFilters } from "../lib/properties.js"

export const listCommand = command(
  {
    name: "list",
    flags: {
      type: {
        type: String,
        alias: "t",
        description: "Filter by doctype",
      },
      parent: {
        type: String,
        alias: "p",
        description: "Filter to descendants of this document ID",
      },
      done: {
        type: Boolean,
        description: "Show done documents only",
        default: false,
      },
      blocked: {
        type: Boolean,
        description: "Show blocked documents only",
        default: false,
      },
      allStatuses: {
        type: Boolean,
        alias: "S",
        description: "Show all documents regardless of status",
        default: false,
      },
      status: {
        type: String,
        description: "Filter by exact status",
      },
      is: {
        type: [String],
        description: "Filter by frontmatter property key:value",
      },
    },
  },
  (argv) => {
    const project = loadProjectFrom(process.cwd())

    const options: ListOptions = {}

    if (argv.flags.type) {
      if (!(argv.flags.type in project.doctypes)) {
        cli.abortError(`Unknown doctype: "${argv.flags.type}"`)
      }
      options.doctype = argv.flags.type
    }

    if (argv.flags.parent) {
      const parentId = parseDocumentRef(argv.flags.parent)
      if (parentId === null) {
        cli.abortError(`Invalid parent ID: "${argv.flags.parent}"`)
      }
      options.parentId = parentId
    }

    if (argv.flags.status) {
      options.status = argv.flags.status
      options.allStatuses = true
    }

    try {
      const propertyFilters = parsePropertyFilters(argv.flags.is, "--is")
      if (propertyFilters.length > 0) {
        options.propertyFilters = propertyFilters
      }
    } catch (err) {
      cli.abortError((err as Error).message)
    }

    if (argv.flags.done) options.done = true
    if (argv.flags.blocked) options.blocked = true
    if (argv.flags.allStatuses) options.allStatuses = true

    const entries = listDocuments(project, options)

    for (const entry of entries) {
      const statusStr = entry.status ? ` (${entry.status})` : ""
      cli.info(
        `${entry.document.tag} ${project.formatId(entry.document.id)} ${entry.title}${statusStr}`,
      )
    }
  },
)
