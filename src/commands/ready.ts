import { command } from "cleye"
import { loadProjectFrom, type ResolvedProject } from "../core/config.js"
import { getCurrentId } from "../core/current.js"
import { buildReadyTree, type ReadyResult } from "../core/ready.js"
import * as cli from "../lib/cli.js"

const flags = {
  withBlocked: {
    type: Boolean,
    description: "Include blocked documents alongside active ones",
    default: false,
  },
} as const

function runReady(argv: { flags: { withBlocked: boolean } }): void {
  let project: ResolvedProject
  try {
    project = loadProjectFrom(process.cwd())
  } catch (err) {
    cli.abortError((err as Error).message)
  }

  const currentId = getCurrentId(project.projectDir)

  let result: ReadyResult
  try {
    result = buildReadyTree(project, currentId, {
      withBlocked: argv.flags.withBlocked,
    })
  } catch (err) {
    cli.abortError((err as Error).message)
  }

  for (const warning of result.warnings) {
    cli.warning(warning)
  }

  if (result.entries.length === 0) {
    cli.info("No actionable documents found.")
    return
  }

  for (const entry of result.entries) {
    const indent = "  ".repeat(entry.depth)
    const label = entry.node.kind === "doc" ? entry.node.tag : "group"
    const paddedId = project.formatId(entry.node.id)
    const statusStr = entry.status ? ` (${entry.status})` : ""
    const currentMarker = entry.isCurrent ? " [current]" : ""
    cli.info(
      `${indent}${label} ${paddedId} ${entry.title}${statusStr}${currentMarker}`,
    )
  }
}

export const readyCommand = command(
  {
    name: "ready",
    flags,
  },
  runReady,
)

export const nextCommand = command(
  {
    name: "next",
    flags,
  },
  runReady,
)
