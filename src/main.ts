import { cli } from "cleye"
import { blockedCommand } from "./commands/blocked.js"
import { currentCommand } from "./commands/current.js"
import { runDefaultCommand } from "./commands/default.js"
import { doneCommand } from "./commands/done.js"
import { editCommand } from "./commands/edit.js"
import { infoCommand } from "./commands/info.js"
import { initCommand } from "./commands/init.js"
import { listCommand } from "./commands/list.js"
import { newCommand } from "./commands/new.js"
import { readCommand } from "./commands/read.js"
import { showCommand } from "./commands/show.js"
import { statusCommand } from "./commands/status.js"
import { tidyCommand } from "./commands/tidy.js"
import { whichCommand } from "./commands/which.js"
import { abortError } from "./lib/cli.js"

const argv = cli({
  name: "pm",
  version: "0.1.0",
  commands: [
    newCommand,
    listCommand,
    readCommand,
    editCommand,
    doneCommand,
    blockedCommand,
    showCommand,
    currentCommand,
    statusCommand,
    tidyCommand,
    initCommand,
    whichCommand,
    infoCommand,
  ],
})
if (argv.command === undefined) {
  if (argv._[0]) {
    argv.showHelp()
    abortError(`Unknown command ${argv._[0]}`)
  } else {
    runDefaultCommand()
  }
}
