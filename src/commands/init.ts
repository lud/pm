import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { join, relative } from "node:path"
import { confirm, input } from "@inquirer/prompts"
import { command } from "cleye"
import { projectFileName, tryLocateProjectFile } from "../core/config.js"
import * as cli from "../lib/cli.js"

const SCHEMA_URL =
  "https://cdn.jsdelivr.net/gh/lud/pm@main/resources/pm-project.schema.json"

const DEFAULT_DIRECTORY = "context/pm"

function buildConfig(directory: string) {
  return {
    $schema: SCHEMA_URL,
    directory,
    types: {
      feature: { tag: "feat" },
      spec: { tag: "spec" },
      task: { tag: "task" },
      adr: {
        tag: "adr",
        defaultStatus: "proposed",
        doneStatuses: ["accepted", "rejected", "superseded"],
      },
      note: { tag: "note", doneStatuses: ["archived"] },
    },
  }
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
    flags: {
      directory: {
        type: String,
        description:
          "Documents directory — skips all prompts (non-interactive)",
      },
    },
  },
  async (argv) => {
    const cwd = process.cwd()
    const fileName = projectFileName()
    const configPath = join(cwd, fileName)
    const interactive = argv.flags.directory === undefined

    if (existsSync(configPath)) {
      cli.abortError(
        `Already a pm project: ${fileName} exists in this directory`,
      )
    }

    const ancestor = tryLocateProjectFile(cwd)
    if (ancestor) {
      const relPath = relative(cwd, ancestor)
      if (interactive) {
        const proceed = await confirm({
          message: `A project file already exists at ${relPath}. Create a nested project here?`,
          default: false,
        })
        if (!proceed) {
          cli.info("Aborted")
          return
        }
      } else {
        cli.warning(`Creating a nested project (found ${relPath})`)
      }
    }

    let directory: string
    if (interactive) {
      directory = await input({
        message: "Documents directory:",
        default: DEFAULT_DIRECTORY,
      })
      directory = directory.trim()
      if (directory === "") directory = DEFAULT_DIRECTORY
    } else {
      directory = (argv.flags.directory as string).trim()
      if (directory === "") {
        cli.abortError("--directory must not be empty")
      }
    }

    const config = buildConfig(directory)
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
    cli.success(`Created ${fileName}`)

    mkdirSync(join(cwd, directory), { recursive: true })
    cli.success(`Created ${directory}/`)

    ensureGitignore(cwd)

    cli.success("Project initialized")
  },
)
