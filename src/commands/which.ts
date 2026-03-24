import { command } from "cleye"
import * as cli from "../lib/cli.js"
import { formatPath } from "../lib/format.js"
import { loadProjectFrom } from "../lib/project.js"

export const whichCommand = command(
  {
    name: "which",
  },
  () => {
    const project = loadProjectFrom(process.cwd())
    cli.info(formatPath(project.projectFile, process.cwd()))
  },
)
