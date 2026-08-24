import { command } from "cleye"
import { loadProjectFrom, type ResolvedProject } from "../core/config.js"
import { clearCurrentId, getCurrentId, touchCurrent } from "../core/current.js"
import { type MarkDoneResult, markDone } from "../core/docs.js"
import { parseRefId } from "../core/refs.js"
import * as cli from "../lib/cli.js"
import { formatPath } from "../lib/format.js"

export const doneCommand = command(
  {
    name: "done",
    parameters: ["<id>"],
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

    let result: MarkDoneResult
    try {
      result = markDone(project, id)
    } catch (err) {
      cli.abortError((err as Error).message)
    }

    const cwd = process.cwd()
    const { document, unblocked } = result
    const displayPath = formatPath(document.path, cwd)
    cli.success(`${displayPath} → ${document.frontmatter.status}`)

    for (const doc of unblocked) {
      const unblockedPath = formatPath(doc.path, cwd)
      cli.success(`${unblockedPath} → ${doc.frontmatter.status} (unblocked)`)
    }

    if (getCurrentId(project.projectDir) === id) {
      clearCurrentId(project.projectDir)
      cli.info("Cleared current document.")
    } else {
      touchCurrent(project.projectDir)
    }
  },
)
