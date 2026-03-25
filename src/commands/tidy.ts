import { readFileSync } from "node:fs"
import { search } from "@inquirer/prompts"
import { command } from "cleye"
import { scanDocuments } from "../core/scanner.js"
import {
  applyTidyPlan,
  buildTidyPlan,
  type DocumentEntry,
  resolveOrphan,
} from "../core/tidy.js"
import * as cli from "../lib/cli.js"
import { formatPath } from "../lib/format.js"
import { parseFrontmatter } from "../lib/frontmatter.js"
import { loadProjectFrom } from "../lib/project.js"

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
      cli.warning(
        "Orphaned documents (parent required but not set or not found):",
      )
      for (const doc of plan.orphans) {
        const parentRef = doc.frontmatter.parent ?? "(none)"
        cli.info(`  ${formatPath(doc.path, cwd)} (parent: ${parentRef})`)
        cli.info(`    → will prompt for parent and relocate when applied`)
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
      return
    }

    // Apply edits and moves from the plan
    applyTidyPlan(plan)

    // Resolve orphans interactively
    if (plan.orphans.length > 0) {
      // Build candidate list: all documents of the expected parent doctype
      for (const orphan of plan.orphans) {
        const expectedParentDoctype = orphan.doctype.parent
        if (!expectedParentDoctype) continue

        // Re-scan to get current state (previous moves may have changed paths)
        const freshProject = loadProjectFrom(process.cwd())
        const candidates = [...scanDocuments(freshProject)]
          .filter((d) => d.doctype.name === expectedParentDoctype)
          .map((d) => {
            const content = readFileSync(d.path, "utf-8")
            const { data, body } = parseFrontmatter(content)
            return {
              ...d,
              frontmatter: data,
              body,
              parentId: null,
            } as DocumentEntry
          })

        if (candidates.length === 0) {
          cli.warning(
            `No ${expectedParentDoctype} documents found to be parent of ${orphan.slug}. Skipping.`,
          )
          continue
        }

        const selected = await promptForOrphanParent(orphan, candidates)
        if (selected) {
          resolveOrphan(freshProject, orphan, selected)
          cli.success(
            `  ${formatPath(orphan.path, cwd)} → parent: ${selected.tag} ${selected.id} ${selected.slug}`,
          )
        } else {
          cli.warning(`  Skipped ${orphan.slug}`)
        }
      }
    }

    cli.success("Tidy complete.")
  },
)

async function promptForOrphanParent(
  orphan: DocumentEntry,
  candidates: DocumentEntry[],
): Promise<DocumentEntry | null> {
  cli.info("")
  cli.warning(
    `Orphan "${orphan.frontmatter.title ?? orphan.slug}" (${orphan.tag} ${orphan.id}) needs a parent.`,
  )
  cli.info(`  Path: ${orphan.path}`)

  return promptSelectDocument("Select parent document:", candidates)
}

async function promptForParent(
  doc: DocumentEntry,
  candidates: DocumentEntry[],
): Promise<DocumentEntry | null> {
  cli.info("")
  cli.warning(
    `Document "${doc.frontmatter.title ?? doc.slug}" (${doc.tag} ${doc.id}) has ambiguous parent.`,
  )

  return promptSelectDocument("Select correct parent:", candidates)
}

async function promptSelectDocument(
  message: string,
  candidates: DocumentEntry[],
): Promise<DocumentEntry | null> {
  const choices = candidates.map((c) => ({
    name: `${c.tag} ${c.id} ${c.frontmatter.title ?? c.slug}`,
    value: c.path,
  }))

  try {
    const selectedPath = await search({
      message,
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
