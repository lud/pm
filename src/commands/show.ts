import { command } from "cleye"
import {
  findType,
  loadProjectFrom,
  type ResolvedProject,
} from "../core/config.js"
import type { DocInfo, ParentChainEntry, ShowResult } from "../core/docs.js"
import { showNode } from "../core/docs.js"
import type { GroupNode } from "../core/nodes.js"
import { parseRefId } from "../core/refs.js"
import * as cli from "../lib/cli.js"
import { formatPath } from "../lib/format.js"

export const showCommand = command(
  {
    name: "show",
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

    try {
      const result = showNode(project, id)
      if (!result) {
        cli.abortError(`Document ${id} not found`)
      }
      displayShowResult(project, result, process.cwd())
    } catch (err) {
      cli.abortError((err as Error).message)
    }
  },
)

function typeLabel(project: ResolvedProject, tag: string): string {
  return findType(project, tag)?.name ?? tag
}

function docTitle(doc: DocInfo): string {
  return typeof doc.frontmatter.title === "string"
    ? doc.frontmatter.title
    : doc.slug
}

function docStatus(doc: DocInfo): string {
  return typeof doc.frontmatter.status === "string"
    ? doc.frontmatter.status
    : "(no status)"
}

export function formatDocHeader(
  project: ResolvedProject,
  doc: DocInfo,
  cwd: string,
): string {
  const lines = [
    `${project.formatId(doc.id)} ${typeLabel(project, doc.tag)} ${docTitle(doc)} (${docStatus(doc)})`,
    `in ${formatPath(doc.path, cwd)}`,
  ]
  return lines.join("\n")
}

export function formatGroupHeader(
  project: ResolvedProject,
  group: GroupNode,
  cwd: string,
): string {
  const lines = [
    `${project.formatId(group.id)} group ${group.slug}`,
    `in ${formatPath(group.path, cwd)}`,
  ]
  return lines.join("\n")
}

function formatDocLine(project: ResolvedProject, doc: DocInfo): string {
  return `  ${typeLabel(project, doc.tag)} ${project.formatId(doc.id)} ${docTitle(doc)} (${docStatus(doc)})`
}

function formatGroupLine(project: ResolvedProject, group: GroupNode): string {
  return `  group ${project.formatId(group.id)} ${group.slug}`
}

export function formatParentsList(
  project: ResolvedProject,
  parents: ParentChainEntry[],
  missingParent?: number,
): string {
  const lines = ["Parents:"]
  if (missingParent !== undefined) {
    lines.push(`  ${project.formatId(missingParent)} (not found)`)
  }
  for (const parent of parents) {
    lines.push(
      parent.kind === "group"
        ? formatGroupLine(project, parent)
        : formatDocLine(project, parent),
    )
  }
  return lines.join("\n")
}

export function formatChildrenList(
  project: ResolvedProject,
  children: DocInfo[],
): string {
  const lines = ["Children:"]
  for (const child of children) {
    lines.push(formatDocLine(project, child))
  }
  return lines.join("\n")
}

export function displayDocRelations(
  project: ResolvedProject,
  result: {
    parents: ParentChainEntry[]
    children: DocInfo[]
    missingParent?: number
  },
): void {
  if (result.parents.length > 0 || result.missingParent !== undefined) {
    cli.info("")
    cli.info(formatParentsList(project, result.parents, result.missingParent))
  }
  if (result.children.length > 0) {
    cli.info("")
    cli.info(formatChildrenList(project, result.children))
  }
}

/** Render a full show result: a doc's header + parents/children, or a
 * group's header + member children. Shared with `status`'s current-document
 * section. */
export function displayShowResult(
  project: ResolvedProject,
  result: ShowResult,
  cwd: string,
): void {
  if (result.kind === "doc") {
    cli.info(formatDocHeader(project, result.document, cwd))
    displayDocRelations(project, result)
  } else {
    cli.info(formatGroupHeader(project, result.group, cwd))
    if (result.children.length > 0) {
      cli.info("")
      cli.info(formatChildrenList(project, result.children))
    }
  }
}
