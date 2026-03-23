import { command } from "cleye"
import { search } from "@inquirer/prompts"
import { loadProjectFrom } from "../lib/project.js"
import { formatPath } from "../lib/format.js"
import {
  buildTidyPlan,
  applyTidyPlan,
  type DocumentEntry,
  type TidyPlan,
} from "../core/tidy.js"
import * as cli from "../lib/cli.js"

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
    },
  },
  async (argv) => {
    const project = loadProjectFrom(process.cwd())
    const cwd = process.cwd()

    const plan = await buildTidyPlan(project, promptForParent)

    const hasChanges =
      plan.edits.length > 0 || plan.moves.length > 0 || plan.orphans.length > 0

    if (!hasChanges) {
      cli.success("Everything is tidy.")
      return
    }

    // Report duplicates
    if (plan.duplicateGroups.size > 0) {
      cli.warning("Duplicate IDs found:")
      for (const [id, group] of plan.duplicateGroups) {
        cli.info(`  ID ${id}:`)
        for (const doc of group) {
          cli.info(`    ${formatPath(doc.path, cwd)}`)
        }
      }
      cli.info("")
    }

    // Report orphans
    if (plan.orphans.length > 0) {
      cli.warning("Orphaned documents (parent not found):")
      for (const doc of plan.orphans) {
        cli.info(
          `  ${formatPath(doc.path, cwd)} (parent: ${doc.frontmatter.parent})`,
        )
      }
      cli.info("")
    }

    // Report edits
    if (plan.edits.length > 0) {
      cli.info("Parent reference updates:")
      for (const edit of plan.edits) {
        cli.info(
          `  ${formatPath(edit.path, cwd)} → parent: ${edit.newParentRef}`,
        )
      }
      cli.info("")
    }

    // Report moves
    if (plan.moves.length > 0) {
      cli.info("File relocations:")
      for (const move of plan.moves) {
        cli.info(
          `  ${formatPath(move.from, cwd)} → ${formatPath(move.to, cwd)}`,
        )
      }
      cli.info("")
    }

    if (!argv.flags.force) {
      cli.info("Dry run. Use -f to apply changes.")
    } else {
      applyTidyPlan(plan)
      cli.success("Tidy complete.")
    }
    return
  },
)

async function promptForParent(
  doc: DocumentEntry,
  candidates: DocumentEntry[],
): Promise<DocumentEntry | null> {
  cli.info("")
  cli.warning(
    `Document "${doc.frontmatter.title ?? doc.slug}" (${doc.tag} ${doc.id}) has ambiguous parent.`,
  )
  cli.info("Select the correct parent:")

  const choices = candidates.map((c) => ({
    name: `${c.tag} ${String(c.id).padStart(3, "0")} ${c.frontmatter.title ?? c.slug} — ${c.path}`,
    value: c.path,
  }))

  try {
    const selectedPath = await search({
      message: "Parent document:",
      source: (input) => {
        if (!input) return choices
        const lower = input.toLowerCase()
        return choices.filter((c) => c.name.toLowerCase().includes(lower))
      },
    })

    return candidates.find((c) => c.path === selectedPath) ?? null
  } catch {
    // User cancelled
    return null
  }
}
