import { command } from "cleye"
import { loadProjectFrom } from "../lib/project.js"
import { getProjectInfo } from "../core/info.js"
import * as cli from "../lib/cli.js"

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
