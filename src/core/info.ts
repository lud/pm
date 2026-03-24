import table from "text-table"
import type { ResolvedProject, ResolvedDoctype } from "../lib/project.js"

function formatDir(dt: ResolvedDoctype): string {
  if (dt.dir === ".") {
    return "(parent dir)"
  }
  return dt.dir
}

function formatParent(dt: ResolvedDoctype): string {
  if (!dt.parent) {
    return "(root)"
  }
  return `→ ${dt.parent}`
}

/**
 * Return a formatted table describing the project's doctype configuration.
 */
export function getProjectInfo(project: ResolvedProject): string {
  const doctypes = Object.values(project.doctypes)

  // Sort: root doctypes first, then by name
  doctypes.sort((a, b) => {
    const aRoot = a.parent ? 1 : 0
    const bRoot = b.parent ? 1 : 0
    if (aRoot !== bRoot) return aRoot - bRoot
    return a.name.localeCompare(b.name)
  })

  const header = [
    "NAME",
    "TAG",
    "PARENT",
    "DIR",
    "BLOCKED STATUSES",
    "DONE STATUSES",
  ]
  const rows = doctypes.map((dt) => [
    dt.name,
    dt.tag,
    formatParent(dt),
    formatDir(dt),
    dt.blockedStatuses.join(", "),
    dt.doneStatuses.join(", "),
  ])

  return table([header, ...rows], {
    align: ["l", "l", "l", "l", "l", "l"],
    hsep: "  ",
  })
}
