import { command } from "cleye"
import { loadProjectFrom, type StatusConfig } from "../core/config.js"
import { resolveGuide } from "../core/guides.js"
import * as cli from "../lib/cli.js"
import { formatPath } from "../lib/format.js"

function formatStatuses(statuses: StatusConfig): string {
  return (
    `default: ${statuses.defaultStatus}  ` +
    `done: ${statuses.doneStatuses.join(", ")}  ` +
    `blocked: ${statuses.blockedStatuses.join(", ")}`
  )
}

export const infoCommand = command(
  {
    name: "info",
  },
  () => {
    try {
      const project = loadProjectFrom(process.cwd())

      cli.info(`Project: ${project.projectDir}`)
      cli.info("")

      if (project.directory === project.rootDir) {
        cli.info(`Directory: ${project.directory}`)
      } else {
        cli.info(`Directory: ${project.directory} (${project.rootDir})`)
      }

      cli.info("")
      const types = Object.values(project.types)
      if (types.length === 0) {
        cli.info("Types: (none)")
      } else {
        cli.info("Types:")
        const cwd = process.cwd()
        for (const type of types) {
          cli.info(`  ${type.name} (${type.tag})`)
          const guide = resolveGuide(project, type)
          if (guide?.description) {
            cli.info(`      ${guide.description}`)
          }
          cli.info(`      ${formatStatuses(type)}`)
          if (guide) {
            cli.info(`      guide: ${formatPath(guide.path, cwd)}`)
          }
        }
      }

      cli.info("")
      cli.info(`Undeclared types use: ${formatStatuses(project.statuses)}`)

      if (project.warnings.length > 0) {
        cli.info("")
        for (const warning of project.warnings) {
          cli.warning(warning)
        }
      }
    } catch (err) {
      cli.abortError((err as Error).message)
    }
  },
)
