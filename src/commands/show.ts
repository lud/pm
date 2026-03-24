import { command } from "cleye"
import { loadProjectFrom } from "../lib/project.js"
import { showDocument, type ShowResult } from "../core/documents.js"
import type { DocumentInfo } from "../core/documents.js"
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

      const fmtId = project.formatId
      const cwd = process.cwd()
      cli.info(formatDocumentHeader(result.document, cwd, fmtId))
      if (result.parents.length > 0) {
        cli.info("")
        cli.info(formatParentsList(result.parents, fmtId))
      }
      if (result.children.length > 0) {
        cli.info("")
        cli.info(formatChildrenList(result.children, fmtId))
      }
    } catch (err) {
      cli.abortError((err as Error).message)
    }
  },
)

export function formatDocumentHeader(
  doc: DocumentInfo,
  cwd: string,
  formatId: (id: number) => string,
): string {
  const title = doc.frontmatter.title ?? doc.slug
  const status = doc.frontmatter.status ?? "(no status)"
  const lines = [
    `${formatId(doc.id)} ${doc.doctype.name} ${title} (${status})`,
    `in ${formatPath(doc.path, cwd)}`,
  ]
  return lines.join("\n")
}

function formatDocLine(
  doc: DocumentInfo,
  formatId: (id: number) => string,
): string {
  const status = doc.frontmatter.status ?? "(no status)"
  const title = doc.frontmatter.title ?? doc.slug
  return `  ${doc.doctype.name} ${formatId(doc.id)} ${title} (${status})`
}

export function formatParentsList(
  parents: DocumentInfo[],
  formatId: (id: number) => string,
): string {
  const lines = ["Parents:"]
  for (const parent of parents) {
    lines.push(formatDocLine(parent, formatId))
  }
  return lines.join("\n")
}

export function formatChildrenList(
  children: DocumentInfo[],
  formatId: (id: number) => string,
): string {
  const lines = ["Children:"]
  for (const child of children) {
    lines.push(formatDocLine(child, formatId))
  }
  return lines.join("\n")
}
