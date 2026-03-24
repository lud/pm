# PM

PM is a file-based project management CLI tool for software developers. It organizes documentation files (features, specs, tasks, etc.) into a configurable hierarchy, with metadata (frontmatter) as the source of truth.

This repository is the source code for the `pm` CLI. The `skills/` directory contains Claude Code skills that teach agents how to use the tool — notably `skills/pm-guide.md` which describes the commands and workflow. This project can itself be managed with `pm`.

## Skills

Skills are created and edited frequently in this project. When creating a new skill, always ask the user whether it should go in the project `skills/` directory (shared, checked into the repo) or in the user's config directory (`$CLAUDE_CONFIG_DIR/skills/`, personal).

## Project structure

```
src/
  main.ts                   # Entry point — registers commands with cleye
  commands/                 # CLI shell — one file per command
  core/                     # Functional core — pure functions, no CLI deps
    documents.ts            # create, read, edit, show, markDone
    listing.ts              # listDocuments, getStatusSummary
    scanner.ts              # document generator function, filename parsing
    current.ts              # .pm.current read/write/clear
  lib/
    cli.ts                  # Output helpers (write, warning, error, etc.)
    fs-helpers.ts           # Filesystem wrappers with abort-on-error
    project.ts              # Project config loading, schema, validation
    frontmatter.ts          # YAML frontmatter parsing and formatting
    format.ts               # Path display formatting
    test-workspace.ts       # Temporary directory helper for tests
    test-setup.ts           # Declarative test project setup helper
tools/
  build-json-schema.ts      # Generates resources/pm-project.schema.json from Zod schema
```

## Architecture

### Functional core / CLI shell

**Core** (`src/core/`): pure functions that take simple arguments and return data. Core functions accept a `ResolvedProject` as a parameter. They throw errors on failure — they never call `process.exit` or print output.

**CLI shell** (`src/commands/`): thin wrappers that parse arguments via cleye, call `loadProjectFrom(process.cwd())`, invoke core functions, and format output. Errors from core are caught and passed to `cli.abortError()`.

### Project loading

- `.pm.json` is located by walking up from CWD.
- `loadProjectFrom(cwd)` — locates and loads the project. Used by command handlers.
- `resolveProject(rawConfig, projectFile)` — resolves a raw config object. Used directly in tests (no disk access needed).
- All paths in `ResolvedProject` are **absolute**. Relative paths only exist in `.pm.json` on disk.

### No default doctypes

There are no built-in doctypes. The `.pm.json` file is the sole source of truth — all doctypes must be explicitly defined. `pm init` writes a complete default config with feature, spec, and task.

## Commands

Commands are built with [cleye](https://github.com/privatenumber/cleye). Each command is a named export from `src/commands/<name>.ts` and registered in `src/main.ts`.

### Two kinds of commands

**Interactive commands** (e.g. `init`) guide the user through a workflow. These may use ``@inquirer/prompts`` for prompts, spinners, and styled output.

**Day-to-day commands** (e.g. `list`, `read`, `status`) are meant to be used in scripts, piped output, or called by LLMs/agents. These must use `src/lib/cli.ts` for all output — no ``@inquirer/prompts``, no `console.log`.

## Output module (`src/lib/cli.ts`)

Use these functions for all output in day-to-day commands:

| Function         | Behavior                                                           |
| ---------------- | ------------------------------------------------------------------ |
| `write(text)`    | stdout, no newline                                                 |
| `writeln(text)`  | stdout + newline                                                   |
| `info(text)`     | alias for `writeln`                                                |
| `warning(text)`  | yellow text                                                        |
| `error(message)` | red text; accepts `string` or `{ message: string }` (e.g. `Error`) |
| `debug(text)`    | cyan text                                                          |
| `success(text)`  | green text                                                         |

## File system helpers (`src/lib/fs-helpers.ts`)

Wrappers around `node:fs` that turn filesystem errors into human-readable (and agent-readable) error messages, then exit cleanly via `abortError`. Commands should use these instead of calling `node:fs` directly.

| Function                           | Wraps           |
| ---------------------------------- | --------------- |
| `mkdirSyncOrAbort(path, opts)`     | `mkdirSync`     |
| `readdirSyncOrAbort(path)`         | `readdirSync`   |
| `readFileSyncOrAbort(path)`        | `readFileSync`  |
| `writeFileSyncOrAbort(path, data)` | `writeFileSync` |

Other filesystem operations should follow the same pattern.

## Path display

Paths printed by commands are relative to CWD when the path is a child of CWD, otherwise absolute. Use `formatPath(path, cwd)` from `src/lib/format.ts`.

## Documents

Documents are markdown files with YAML frontmatter. Filename format: `{ID}.{tag}.{slug}.md` (e.g. `001.feat.user-auth.md`).

- **IDs are global integers** — unique across all doctypes. `001`, `1`, and `0001` all refer to the same document.
- **Parent references** are normally stored in frontmatter as `{id}.{tag}.{slug}` (for example, `parent: 1.feat.user-auth`). PM also accepts a numeric ID alone (`parent: 1`) as a shorthand for manual edits and backwards compatibility.
- **Statuses** are free-form strings. Each doctype defines `doneStatuses` — statuses that mean "no more work needed."

## Testing

We use [vitest](https://vitest.dev/). Every core and lib module should have a matching `.test.ts`.

**Core functions are tested directly** — construct a `ResolvedProject` with `resolveProject()`, call the function, assert on returned data. No mocking needed.

**CLI commands are tested with mocks** — `vi.mock("../lib/cli.js")` to capture output.

**Abort mocking:** When testing code that calls `abortError`/`abort`, the mock must throw to stop execution:

```typescript
vi.mock("./cli.js", async () => {
  const actual = await vi.importActual("./cli.js") as Record<string, unknown>
  return {
    ...actual,
    abortError: vi.fn((msg: string) => { throw new Error(msg) }),
  }
})
```

**Test projects** are set up declaratively with `createTestProject(label)` from `src/lib/test-setup.ts`. Each `setup()` call creates a fresh temp directory with `.pm.json`, optional `.pm.current`, and all declared document files:

```typescript
import { createTestProject } from "../lib/test-setup.js"

const testProject = createTestProject("mytest")

it("does something", () => {
  const { dir, project } = testProject.setup({
    pmJson: {
      doctypes: {
        feature: { tag: "feat", dir: "context/features", intermediateDir: true },
        spec: { tag: "spec", dir: ".", parent: "feature" },
        task: { tag: "task", dir: ".", parent: "spec" },
      },
    },
    pmCurrent: 3, // optional — writes .pm.current
    files: {
      "context/features/001.feat.auth/001.feat.auth.md": { title: "Auth", status: "new" },
      "context/features/001.feat.auth/002.spec.login.md": { parent: 1, title: "Login", status: "new" },
    },
  })
  // dir is the temp directory, project is a ResolvedProject
})
```

Cleanup is automatic via `afterAll`. For tests that only need an empty temp directory (no project setup), use `createTestWorkspace(label)` from `src/lib/test-workspace.ts`.
