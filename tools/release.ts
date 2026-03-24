#!/usr/bin/env npx tsx

/**
 * Release script: bump version, generate changelog, commit and tag.
 *
 * Usage:
 *   npx tsx tools/release.ts patch    # 0.1.0 → 0.1.1
 *   npx tsx tools/release.ts minor    # 0.1.0 → 0.2.0
 *   npx tsx tools/release.ts major    # 0.1.0 → 1.0.0
 *   npx tsx tools/release.ts 1.2.3    # explicit version
 */

import { execSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const rootDir = join(import.meta.dirname, "..")
const pkgPath = join(rootDir, "package.json")

function run(cmd: string): string {
  return execSync(cmd, { cwd: rootDir, encoding: "utf-8" }).trim()
}

function bumpVersion(current: string, bump: string): string {
  const [major, minor, patch] = current.split(".").map(Number)
  switch (bump) {
    case "patch":
      return `${major}.${minor}.${patch + 1}`
    case "minor":
      return `${major}.${minor + 1}.0`
    case "major":
      return `${major + 1}.0.0`
    default:
      // Treat as explicit version
      if (!/^\d+\.\d+\.\d+$/.test(bump)) {
        console.error(`Invalid version or bump type: "${bump}"`)
        console.error("Usage: release.ts [patch|minor|major|x.y.z]")
        process.exit(1)
      }
      return bump
  }
}

// Parse argument
const bump = process.argv[2]
if (!bump) {
  console.error("Usage: release.ts [patch|minor|major|x.y.z]")
  process.exit(1)
}

// Read current version
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"))
const currentVersion: string = pkg.version
const newVersion = bumpVersion(currentVersion, bump)
const tag = `v${newVersion}`

console.log(`${currentVersion} → ${newVersion}`)

// Check for uncommitted changes
const status = run("git status --porcelain")
if (status) {
  console.error(
    "Error: working directory is not clean. Commit or stash changes first.",
  )
  process.exit(1)
}

// 1. Bump version in package.json
pkg.version = newVersion
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n")
console.log(`Updated package.json`)

// 2. Generate changelog with git-cliff
run(`git-cliff --tag ${tag} -o CHANGELOG.md`)
console.log(`Generated CHANGELOG.md`)

// 3. Stage, commit, and tag
run("git add package.json CHANGELOG.md")
run(`git commit -m "${tag}"`)
run(`git tag -a ${tag} -m "${tag}"`)
console.log(`Committed and tagged ${tag}`)
