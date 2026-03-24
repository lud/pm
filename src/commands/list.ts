import { command } from "cleye"
import { loadProjectFrom } from "../lib/project.js"
import { listDocuments, type ListFilter } from "../core/listing.js"
import { parseDocumentRef } from "../core/scanner.js"
import { formatPath } from "../lib/format.js"
import * as cli from "../lib/cli.js"
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
      active: {
        type: Boolean,
        description: "Show active documents (default)",
        default: false,
      },
      done: {
        type: Boolean,
        description: "Show done documents",
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

    const filter: ListFilter = {}

    if (argv.flags.type) {
      if (!(argv.flags.type in project.doctypes)) {
        cli.abortError(`Unknown doctype: "${argv.flags.type}"`)
      }
      filter.doctype = argv.flags.type
    }

    if (argv.flags.parent) {
      const parentId = parseDocumentRef(argv.flags.parent)
      if (parentId === null) {
        cli.abortError(`Invalid parent ID: "${argv.flags.parent}"`)
      }
      filter.parentId = parentId
    }

    if (argv.flags.status) {
      filter.status = argv.flags.status
    }

    try {
      const propertyFilters = parsePropertyFilters(argv.flags.is, "--is")
      if (propertyFilters.length > 0) {
        filter.propertyFilters = propertyFilters
      }
    } catch (err) {
      cli.abortError((err as Error).message)
    }

    if (argv.flags.active) filter.active = true
    if (argv.flags.done) filter.done = true

    const entries = listDocuments(project, filter)

    for (const entry of entries) {
      const statusStr = entry.status ? ` (${entry.status})` : ""
      cli.info(
        `${entry.tag} ${String(entry.id).padStart(3, "0")} ${entry.title}${statusStr}`,
      )
    }
  },
)
