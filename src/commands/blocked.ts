import { command } from "cleye"
import { loadProjectFrom, type ResolvedProject } from "../core/config.js"
import { touchCurrent } from "../core/current.js"
import { type DocInfo, markBlocked } from "../core/docs.js"
import { parseRefId } from "../core/refs.js"
import * as cli from "../lib/cli.js"
import { formatPath } from "../lib/format.js"

export const blockedCommand = command(
  {
    name: "blocked",
    parameters: ["<id>"],
    flags: {
      by: {
        type: String,
        description: "ID of the blocking document",
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

    let blockedBy: number | undefined
    if (argv.flags.by) {
      blockedBy = parseRefId(argv.flags.by) ?? undefined
      if (blockedBy === undefined) {
        cli.abortError(`Invalid document ID: "${argv.flags.by}"`)
      }
    }

    let doc: DocInfo
    try {
      doc = markBlocked(project, id, { blockedBy })
    } catch (err) {
      cli.abortError((err as Error).message)
    }

    touchCurrent(project.projectDir)
    const displayPath = formatPath(doc.path, process.cwd())
    cli.success(`${displayPath} → ${doc.frontmatter.status}`)
    if (blockedBy === undefined) {
      cli.info("Tip: use --by <id> to reference the blocking document")
    }
  },
)
