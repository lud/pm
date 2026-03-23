import { command } from "cleye"
import { loadProjectFrom } from "../lib/project.js"
import { formatPath } from "../lib/format.js"
import * as cli from "../lib/cli.js"

export const whichCommand = command(
  {
    name: "which",
  },
  () => {
    const project = loadProjectFrom(process.cwd())
    cli.info(formatPath(project.projectFile, process.cwd()))
  },
)
