import { search } from "@inquirer/prompts"
import { command } from "cleye"
import { loadProjectFrom, type ResolvedProject } from "../core/config.js"
import type { DocInfo } from "../core/docs.js"
import type { Node } from "../core/nodes.js"
import {
  applyTidyPlan,
  buildTidyPlan,
  isNoopPlan,
  type TidyPlan,
} from "../core/tidy.js"
import * as cli from "../lib/cli.js"
import { formatPath } from "../lib/format.js"

export const tidyCommand = command(
  {
    name: "tidy",
    flags: {
      force: {
        type: Boolean,
        alias: "f",
        description: "Apply changes (default is dry-run)",
        default: false,
      },
      "no-interactive": {
        type: Boolean,
        description:
          "Skip interactive decisions; ambiguities are warned and left untouched",
        default: false,
      },
    },
  },
  async (argv) => {
    let project: ResolvedProject
    try {
      project = loadProjectFrom(process.cwd())
    } catch (err) {
      cli.abortError((err as Error).message)
    }

    for (const warning of project.warnings) {
      cli.warning(warning)
    }

    // Interactive disambiguation only when applying; a dry run — or
    // --no-interactive — reports ambiguities as warnings instead.
    const interactive = argv.flags.force && !argv.flags["no-interactive"]
    let plan: TidyPlan
    try {
      plan = await buildTidyPlan(
        project,
        interactive ? promptForParent : undefined,
      )
    } catch (err) {
      cli.abortError((err as Error).message)
    }

    for (const warning of plan.warnings) {
      cli.warning(warning)
    }

    if (isNoopPlan(plan)) {
      cli.success("Everything is tidy.")
      return
    }

    displayPlan(plan, process.cwd())

    if (!argv.flags.force) {
      cli.info("Dry run. Use -f to apply changes.")
      return
    }

    try {
      applyTidyPlan(plan)
    } catch (err) {
      cli.abortError((err as Error).message)
    }
    cli.success("Tidy complete.")
  },
)

function displayPlan(plan: TidyPlan, cwd: string): void {
  if (plan.renumberings.length > 0) {
    cli.info("ID changes:")
    for (const r of plan.renumberings) {
      const label = r.node.kind === "doc" ? r.node.tag : "group"
      cli.info(`  ${r.node.id} → ${r.newId} (${label} ${r.node.slug})`)
    }
    cli.info("")
  }

  if (plan.groupRenames.length > 0) {
    cli.info("Directory renames:")
    for (const rename of plan.groupRenames) {
      cli.info(
        `  ${formatPath(rename.from, cwd)} → ${formatPath(rename.to, cwd)}`,
      )
    }
    cli.info("")
  }

  if (plan.edits.length > 0) {
    cli.info("Frontmatter updates:")
    for (const edit of plan.edits) {
      for (const [key, value] of Object.entries(edit.updates)) {
        cli.info(
          `  ${formatPath(edit.path, cwd)} → ${key}: ${formatValue(value)}`,
        )
      }
    }
    cli.info("")
  }

  if (plan.moves.length > 0) {
    cli.info("File moves:")
    for (const move of plan.moves) {
      cli.info(`  ${formatPath(move.from, cwd)} → ${formatPath(move.to, cwd)}`)
    }
    cli.info("")
  }
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(String).join(", ")}]`
  }
  return String(value)
}

async function promptForParent(
  doc: DocInfo,
  candidates: Node[],
): Promise<Node | null> {
  cli.info("")
  cli.warning(
    `Document "${doc.frontmatter.title ?? doc.slug}" (${doc.tag} ${doc.id}) has an ambiguous parent.`,
  )

  const choices = candidates.map((c) => ({
    name:
      c.kind === "doc"
        ? `${c.tag} ${c.id} ${(c as DocInfo).frontmatter?.title ?? c.slug}`
        : `group ${c.id} ${c.slug}`,
    value: c.path,
  }))

  try {
    const selectedPath = await search({
      message: "Select correct parent:",
      source: (input) => {
        if (!input) return choices
        const lower = input.toLowerCase()
        return choices.filter((c) => c.name.toLowerCase().includes(lower))
      },
    })
    return candidates.find((c) => c.path === selectedPath) ?? null
  } catch {
    return null
  }
}
