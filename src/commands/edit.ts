import { command } from "cleye"
import { touchCurrent } from "../core/current.js"
import { editDocument, readDocument } from "../core/documents.js"
import { formatParentRef } from "../core/parent-ref.js"
import { parseDocumentRef } from "../core/scanner.js"
import * as cli from "../lib/cli.js"
import { formatPath } from "../lib/format.js"
import { loadProjectFrom } from "../lib/project.js"
import {
  flagsToRecord,
  type PropertyFlag,
  parsePropertyFlag,
} from "../lib/properties.js"

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
      "blocked-by": {
        type: String,
        description:
          "Set blocking document ID (requires --set status:<blocked-status>)",
      },
      set: {
        type: [String],
        description: "Set frontmatter property: key:value",
      },
      "update-slug": {
        type: Boolean,
        description: "Rewrite filename slug to match the current title",
        default: false,
      },
    },
  },
  (argv) => {
    const project = loadProjectFrom(process.cwd())
    const id = parseDocumentRef(argv._.id)
    if (id === null) {
      cli.abortError(`Invalid document ID: "${argv._.id}"`)
    }

    let flags: PropertyFlag[]
    try {
      flags = (argv.flags.set ?? []).map((s) => parsePropertyFlag(s, "--set"))
    } catch (err) {
      cli.abortError((err as Error).message)
      return
    }

    const properties = flagsToRecord(flags)

    let setParent: number | undefined
    if (argv.flags.parent) {
      setParent = parseDocumentRef(argv.flags.parent) ?? undefined
      if (setParent === undefined) {
        cli.abortError(`Invalid parent ID: "${argv.flags.parent}"`)
      }

      const parentFlag = flags.find((f) => f.key === "parent")
      if (parentFlag) {
        cli.abortError(
          `Cannot combine --parent with --set ${parentFlag.raw} on "edit"`,
        )
      }
    }

    // Handle --blocked-by
    if (argv.flags["blocked-by"]) {
      const blockedByFlag = flags.find((f) => f.key === "blocked_by")
      if (blockedByFlag) {
        cli.abortError(
          `Cannot combine --blocked-by with --set ${blockedByFlag.raw}`,
        )
      }

      const blockedById =
        parseDocumentRef(argv.flags["blocked-by"]) ?? undefined
      if (blockedById === undefined) {
        cli.abortError(`Invalid document ID: "${argv.flags["blocked-by"]}"`)
      }

      // Require --set status:<blocked-status>
      const doc = readDocument(project, id)
      if (!doc) {
        cli.abortError(`Document ${id} not found`)
      }

      const statusValue = properties.status
      if (statusValue === undefined) {
        cli.abortError(
          `--blocked-by requires --set status:<status> with a blocked status`,
        )
      }

      if (!doc.doctype.blockedStatuses.includes(String(statusValue))) {
        cli.abortError(
          `Status "${statusValue}" is not a blocked status for doctype "${doc.doctype.name}". Blocked statuses: ${doc.doctype.blockedStatuses.join(", ")}`,
        )
      }

      // Resolve the blocking document to a ref string
      const blockerDoc = readDocument(project, blockedById)
      if (!blockerDoc) {
        cli.abortError(`Blocking document ${blockedById} not found`)
      }
      properties.blocked_by = formatParentRef(
        blockerDoc.id,
        blockerDoc.tag,
        blockerDoc.slug,
      )
    }

    try {
      const { document: doc, renamed } = editDocument(project, id, {
        setParent,
        setProperties:
          Object.keys(properties).length > 0 ? properties : undefined,
        updateSlug: argv.flags["update-slug"],
      })

      touchCurrent(project.projectDir)
      const displayPath = formatPath(doc.path, process.cwd())
      cli.success(`Updated ${displayPath}`)
      if (renamed) {
        cli.info(
          `Renamed ${formatPath(renamed.from, process.cwd())} → ${formatPath(renamed.to, process.cwd())}`,
        )
      }
    } catch (err) {
      cli.abortError((err as Error).message)
    }
  },
)
