import { command } from "cleye"
import {
  existsSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
} from "node:fs"
import { join, relative } from "node:path"
import { confirm } from "@inquirer/prompts"
import * as cli from "../lib/cli.js"
import { tryLocateProjectFile } from "../lib/project.js"

const SCHEMA_URL =
  "https://cdn.jsdelivr.net/gh/lud/pm@main/resources/pm-project.schema.json"

const DEFAULT_CONFIG = {
  $schema: SCHEMA_URL,
  idMask: "000",
  doctypes: {
    feature: {
      tag: "feat",
      dir: "context/features",
      requireParent: true,
      intermediateDir: true,
      doneStatuses: ["done"],
      defaultStatus: "new",
    },
    spec: {
      tag: "spec",
      dir: ".",
      parent: "feature",
      requireParent: true,
      intermediateDir: false,
      doneStatuses: ["done"],
      defaultStatus: "new",
    },
    task: {
      tag: "task",
      dir: ".",
      parent: "spec",
      requireParent: true,
      intermediateDir: false,
      doneStatuses: ["done"],
      defaultStatus: "new",
    },
  },
}

function ensureGitignore(cwd: string): void {
  const gitignorePath = join(cwd, ".gitignore")
  if (existsSync(gitignorePath)) {
    const gitignore = readFileSync(gitignorePath, "utf-8")
    if (!gitignore.includes(".pm.current")) {
      appendFileSync(gitignorePath, "\n.pm.current\n")
      cli.success("Added .pm.current to .gitignore")
    }
  } else {
    writeFileSync(gitignorePath, ".pm.current\n")
    cli.success("Created .gitignore with .pm.current")
  }
}

export const initCommand = command(
  {
    name: "init",
  },
  async () => {
    const cwd = process.cwd()
    const configPath = join(cwd, ".pm.json")

    if (existsSync(configPath)) {
      const proceed = await confirm({
        message: ".pm.json already exists in this directory. Overwrite?",
        default: false,
      })
      if (!proceed) {
        cli.info("Aborted")
        return
      }
    } else {
      const existing = tryLocateProjectFile(cwd)
      if (existing) {
        const relPath = relative(cwd, existing)
        const proceed = await confirm({
          message: `A project file already exists at ${relPath}. Create a nested project here?`,
          default: false,
        })
        if (!proceed) {
          cli.info("Aborted")
          return
        }
      }
    }

    writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n")
    cli.success("Created .pm.json")

    ensureGitignore(cwd)

    cli.success("Project initialized")
  },
)
