import { command } from "cleye"
import { getCurrentId } from "../core/current.js"
import { buildNextTree } from "../core/next.js"
import * as cli from "../lib/cli.js"
import { loadProjectFrom } from "../lib/project.js"

export const nextCommand = command(
  {
    name: "next",
    flags: {
      withBlocked: {
        type: Boolean,
        description: "Include blocked documents alongside active ones",
        default: false,
      },
    },
  },
  (argv) => {
    const project = loadProjectFrom(process.cwd())
    const currentId = getCurrentId(project.projectDir)

    const tree = buildNextTree(project, currentId, {
      withBlocked: argv.flags.withBlocked,
    })

    if (tree.length === 0) {
      cli.info("No actionable documents found.")
      return
    }

    for (const node of tree) {
      const indent = "  ".repeat(node.depth)
      const statusStr = node.status ? ` (${node.status})` : ""
      const currentMarker = node.isCurrent ? " [current]" : ""
      cli.info(
        `${indent}${node.document.tag} ${project.formatId(node.document.id)} ${node.title}${statusStr}${currentMarker}`,
      )
    }
  },
)
