import { cli } from "cleye"
import { newCommand } from "./commands/new.js"
import { listCommand } from "./commands/list.js"
import { readCommand } from "./commands/read.js"
import { editCommand } from "./commands/edit.js"
import { doneCommand } from "./commands/done.js"
import { showCommand } from "./commands/show.js"
import { currentCommand } from "./commands/current.js"
import { statusCommand } from "./commands/status.js"
import { initCommand } from "./commands/init.js"
import { tidyCommand } from "./commands/tidy.js"
import { whichCommand } from "./commands/which.js"
import { runDefaultCommand } from "./commands/default.js"

const argv = cli({
  name: "pm",
  version: "0.1.0",
  commands: [
    newCommand,
    listCommand,
    readCommand,
    editCommand,
    doneCommand,
    showCommand,
    currentCommand,
    statusCommand,
    tidyCommand,
    initCommand,
    whichCommand,
  ],
})

if (!argv.command) {
  runDefaultCommand()
}
