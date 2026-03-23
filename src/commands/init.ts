import { command } from "cleye"
import {
  existsSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
} from "node:fs"
import { join } from "node:path"
import { input } from "@inquirer/prompts"
import * as cli from "../lib/cli.js"

const SCHEMA_URL =
  "https://cdn.jsdelivr.net/gh/lud/pm@main/resources/pm-project.schema.json"

export const initCommand = command(
  {
    name: "init",
  },
  async () => {
    const cwd = process.cwd()
    const configPath = join(cwd, ".pm.json")

    if (existsSync(configPath)) {
      // File exists — ensure $schema is present
      const content = readFileSync(configPath, "utf-8")
      const parsed = JSON.parse(content)
      if (!parsed.$schema) {
        parsed.$schema = SCHEMA_URL
        writeFileSync(configPath, JSON.stringify(parsed, null, 2) + "\n")
        cli.success("Added $schema to existing .pm.json")
      } else {
        cli.info(".pm.json already exists with $schema")
      }
      return
    }

    // New project — ask for features directory
    const featuresDir = await input({
      message: "Where should features be stored?",
      default: "context/features",
    })

    const config = {
      $schema: SCHEMA_URL,
      doctypes: {
        feature: {
          dir: featuresDir,
        },
      },
    }

    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n")
    cli.success("Created .pm.json")

    // Add .pm.current to .gitignore
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

    cli.success("Project initialized")
  },
)
