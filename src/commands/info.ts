import { command } from "cleye"
import { getProjectInfo } from "../core/info.js"
import * as cli from "../lib/cli.js"
import { loadProjectFrom } from "../lib/project.js"

export const infoCommand = command(
  {
    name: "info",
  },
  () => {
    const project = loadProjectFrom(process.cwd())

    cli.info(`Project: ${project.projectDir}`)
    cli.info("")
    cli.info(getProjectInfo(project))
  },
)
