import { command } from "cleye"
import { loadProjectFrom } from "../lib/project.js"
import { showDocument, type ShowResult } from "../core/documents.js"
import { parseDocumentRef } from "../core/scanner.js"
import { formatPath } from "../lib/format.js"
import * as cli from "../lib/cli.js"

export const showCommand = command(
  {
    name: "show",
    parameters: ["<id>"],
  },
  (argv) => {
    const project = loadProjectFrom(process.cwd())
    const id = parseDocumentRef(argv._.id)
    if (id === null) {
      cli.abortError(`Invalid document ID: "${argv._.id}"`)
    }

    try {
      const result = showDocument(project, id)
      if (!result) {
        cli.abortError(`Document ${id} not found`)
      }

      printShowResult(result, process.cwd())
    } catch (err) {
      cli.abortError((err as Error).message)
    }
  },
)

export function printShowResult(result: ShowResult, cwd: string): void {
  const { document: doc, parents, children } = result

  // Document properties
  cli.info(`doctype: ${doc.doctype.name}`)
  cli.info(`id: ${doc.id}`)
  cli.info(`path: ${formatPath(doc.path, cwd)}`)
  cli.info(`title: ${doc.frontmatter.title ?? doc.slug}`)
  cli.info(`status: ${doc.frontmatter.status ?? "(none)"}`)

  // Parents
  if (parents.length > 0) {
    cli.info("")
    cli.info("Parents:")
    for (const parent of parents) {
      const status = parent.frontmatter.status ?? "(none)"
      const title = parent.frontmatter.title ?? parent.slug
      cli.info(
        `  ${parent.doctype.name} ${String(parent.id).padStart(3, "0")} ${title} (${status})`,
      )
    }
  }

  // Children
  if (children.length > 0) {
    cli.info("")
    cli.info("Children:")
    for (const child of children) {
      const status = child.frontmatter.status ?? "(none)"
      const title = child.frontmatter.title ?? child.slug
      cli.info(
        `  ${child.doctype.name} ${String(child.id).padStart(3, "0")} ${title} (${status})`,
      )
    }
  }
}
