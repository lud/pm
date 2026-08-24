import { command } from "cleye"
import {
  findType,
  loadProjectFrom,
  type ResolvedProject,
} from "../core/config.js"
import { touchCurrent } from "../core/current.js"
import { editDocument, readDocument } from "../core/docs.js"
import { statusConfigFor } from "../core/list.js"
import { findNodeById, type ScanResult, scanNodes } from "../core/nodes.js"
import { formatDocRef, formatGroupRef, parseRefId } from "../core/refs.js"
import * as cli from "../lib/cli.js"
import { formatPath } from "../lib/format.js"
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
        description: "Set parent document or group ID",
      },
      type: {
        type: String,
        description: "Change the document type (name or tag)",
      },
      "blocked-by": {
        type: String,
        description:
          "Set blocking document or group ID (requires --set status:<blocked-status>)",
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
    let project: ResolvedProject
    try {
      project = loadProjectFrom(process.cwd())
    } catch (err) {
      cli.abortError((err as Error).message)
    }

    const id = parseRefId(argv._.id)
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
      setParent = parseRefId(argv.flags.parent) ?? undefined
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

      const blockedById = parseRefId(argv.flags["blocked-by"]) ?? undefined
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

      const typeLabel = findType(project, doc.tag)?.name ?? doc.tag
      const { blockedStatuses } = statusConfigFor(project, doc.tag)
      if (!blockedStatuses.includes(String(statusValue))) {
        cli.abortError(
          `Status "${statusValue}" is not a blocked status for type "${typeLabel}". Blocked statuses: ${blockedStatuses.join(", ")}`,
        )
      }

      // Resolve the blocking node (doc or group) to a qualified ref
      let scan: ScanResult
      try {
        scan = scanNodes(project)
      } catch (err) {
        cli.abortError((err as Error).message)
        return
      }
      const blockerNode = findNodeById(scan, blockedById)
      if (!blockerNode) {
        cli.abortError(`Blocking node ${blockedById} not found`)
      }
      properties.blocked_by =
        blockerNode.kind === "group"
          ? formatGroupRef(blockerNode.id, blockerNode.slug, project.formatId)
          : formatDocRef(
              blockerNode.id,
              blockerNode.tag,
              blockerNode.slug,
              project.formatId,
            )
    }

    try {
      const { document: doc, renamed } = editDocument(project, id, {
        setParent,
        setType: argv.flags.type,
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
