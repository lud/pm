# PM

PM is a file-based project management CLI tool for software developers. It organizes documentation files (features, specs, tasks, etc.) in a flat, configurable structure, with metadata (frontmatter) as the source of truth.

This repository is the source code for the `pm` CLI. The `skills/` directory contains Claude Code skills that teach agents how to use the tool — notably `skills/pm-guide.md` which describes the commands and workflow. This project can itself be managed with `pm`.

## Skills

Skills are created and edited frequently in this project. When creating a new skill, always ask the user whether it should go in the project `skills/` directory (shared, checked into the repo) or in the user's config directory (`$CLAUDE_CONFIG_DIR/skills/`, personal).

When writing `pm` command examples in skills, always use long option names (e.g. `--parent`, `--status`, `--type`) instead of short flags (`-p`, `-s`, `-t`). Agents parse long options more reliably.

Changes to commands (arguments, options), new commands, and deprecated commands must always be reflected in `skills/pm-guide/SKILL.md`.

## Project structure

```
src/
  main.ts                   # Entry point — registers commands with cleye
  commands/                 # CLI shell — one file per command
  core/                     # Functional core — pure functions, no CLI deps
    config.ts               # pm.json loading, schema, validation, types vocabulary
    nodes.ts                # scanner: docs + group directories, ID lookup
    refs.ts                 # node references ({id}.{tag}.{slug} / {id}.{slug}), depends parsing
    docs.ts                 # create, read, edit, show, markDone, markBlocked
    list.ts                 # listDocuments, getStatusSummary, status classification
    ready.ts                # buildReadyTree — the depends-aware actionable tree
    tidy.ts                 # buildTidyPlan / applyTidyPlan (plan/apply two-phase)
    current.ts              # .pm.current read/write/clear
    migration.test.ts       # zero-migration compatibility contract (fixtures)
  lib/
    cli.ts                  # Output helpers (write, warning, error, etc.)
    fs-helpers.ts           # Filesystem wrappers that throw readable Errors
    frontmatter.ts          # YAML frontmatter parsing and formatting
    format.ts               # Path display formatting
    properties.ts           # --set / --is key:value flag parsing
    test-workspace.ts       # Temporary directory helper for tests
    test-setup.ts           # Declarative test project setup helper
tools/
  build-json-schema.ts      # Generates resources/pm-project.schema.json from the strict Zod schema
```

## Architecture

### Functional core / CLI shell

**Core** (`src/core/`): pure functions that take simple arguments and return data. Core functions accept a `ResolvedProject` as a parameter. They throw plain `Error`s on failure — they never call `process.exit` or print output.

**CLI shell** (`src/commands/`): thin wrappers that parse arguments via cleye, call `loadProjectFrom(process.cwd())`, invoke core functions, and format output. Errors thrown by core are caught and passed to `cli.abortError((err as Error).message)`. Validation aborts (invalid ID, etc.) sit outside any try/catch; only throwing core calls are wrapped.

### Project loading

- `pm.json` is located by walking up from CWD. The `PMFILE` environment variable overrides the file name (undocumented; used to run pm on its own repo).
- `loadProjectFrom(cwd)` in `src/core/config.ts` — locates and loads the project. Used by command handlers.
- `resolveConfig(rawConfig, projectFile)` — resolves a raw config object. Used directly in tests (no disk access needed).
- All paths in `ResolvedProject` are **absolute**. Relative paths only exist in `pm.json` on disk.
- Legacy v1 configs (a `doctypes` key, structural fields) load with warnings collected in `project.warnings` — never errors. `directory` is the one required key.

### Flat model

There is no doctype hierarchy. `pm.json` declares a single root `directory` and a `types` vocabulary (name → tag + optional status overrides); types are metadata labels, not structure. Type names and tags share one lookup namespace (`pm new feat` ≡ `pm new feature`). The scanner accepts any tag matching the filename pattern; undeclared tags get global status config and warnings, never invisibility.

## Commands

Commands are built with [cleye](https://github.com/privatenumber/cleye). Each command is a named export from `src/commands/<name>.ts` and registered in `src/main.ts`. `next` is an undocumented alias of `ready`.

### Two kinds of commands

**Interactive commands** (e.g. `init`, `tidy --force` prompts) guide the user through a workflow. These may use ``@inquirer/prompts`` for prompts, spinners, and styled output.

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

Wrappers around `node:fs` that turn filesystem errors into human-readable (and agent-readable) plain `Error`s. Core code uses these instead of calling `node:fs` directly; the CLI shell maps the thrown errors to `abortError`.

| Function                            | Wraps           |
| ----------------------------------- | --------------- |
| `mkdirSyncOrThrow(path, opts)`      | `mkdirSync`     |
| `readdirSyncOrThrow(path)`          | `readdirSync`   |
| `readFileSyncOrThrow(path)`         | `readFileSync`  |
| `writeFileSyncOrThrow(path, data)`  | `writeFileSync` |
| `renameSyncOrThrow(from, to)`       | `renameSync`    |
| `rmdirSyncOrThrow(path)`            | `rmdirSync`     |

Other filesystem operations should follow the same pattern.

## Path display

Paths printed by commands are relative to CWD when the path is a child of CWD, otherwise absolute. Use `formatPath(path, cwd)` from `src/lib/format.ts`.

## Documents and groups

Documents are markdown files with YAML frontmatter. Filename format: `{ID}.{tag}.{slug}.md` (e.g. `001.feat.user-auth.md`). Groups are bare directories named `{ID}.{slug}/` at the root of the documents directory — no frontmatter, no status; they share the global ID sequence with documents.

- **IDs are global integers** — unique across all documents and groups. `001`, `1`, and `0001` all refer to the same node.
- **Parent references** live in frontmatter and may name a document (`parent: 1.feat.user-auth`) or a group (`parent: 12.some-group`); a bare numeric ID is accepted as shorthand. The ID is authoritative; tag/slug/form are hints only — resolve IDs against the scan, never trust the parsed form.
- **Placement follows the parent**: child of a document → same directory; child of a group → inside the group directory; no parent → root of the documents directory. Frontmatter is authoritative, location is derived — `pm tidy` heals drift and adopts parentless docs found inside groups.
- **`depends:`** is a frontmatter list of document IDs or refs; `pm ready` excludes docs with un-done dependencies. Group refs in `depends` are warned about and ignored, never fixed.
- **Statuses** are free-form strings. Global `doneStatuses`/`blockedStatuses`/`defaultStatus` apply, with optional per-type overrides.

## Testing

All behavioural changes must be covered by tests. For bug fixes, follow this sequence:

1. Add a test that verifies the correct behaviour (it will fail against the current code).
2. Run the full test suite to confirm the new test fails.
3. Implement the fix.
4. Run the full test suite again to confirm all tests pass.

We use [vitest](https://vitest.dev/). Every core and lib module should have a matching `.test.ts`.

**Core functions are tested directly** — set up a project with `createTestProject(...).setup(...)`, call the function, assert on returned data. No mocking needed.

**CLI commands are tested with mocks** — `vi.mock("../lib/cli.js")` to capture output, `vi.mock("../core/config.js")` for `loadProjectFrom`, and invocation through `cli({name: "pm", commands: [...]}, undefined, [...])`. See `src/commands/which.test.ts` for the canonical pattern.

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

**Test projects** are set up declaratively with `createTestProject(label)` from `src/lib/test-setup.ts`. Each `setup()` call creates a fresh temp directory with `pm.json`, optional `.pm.current`, extra directories (e.g. empty groups), and all declared document files:

```typescript
import { createTestProject } from "../lib/test-setup.js"

const testProject = createTestProject("mytest")

it("does something", () => {
  const { dir, project } = testProject.setup({
    pmJson: {
      directory: "docs",
      types: {
        feature: { tag: "feat" },
        task: { tag: "task" },
      },
    },
    pmCurrent: 3, // optional — writes .pm.current
    dirs: ["docs/010.icebox"], // optional — empty group directories
    files: {
      "docs/001.feat.auth.md": { title: "Auth", status: "new" },
      "docs/002.task.login.md": { parent: "1.feat.auth", title: "Login", status: "new" },
    },
  })
  // dir is the temp directory, project is a ResolvedProject
})
```

Cleanup is automatic via `afterAll`. For tests that only need an empty temp directory (no project setup), use `createTestWorkspace(label)` from `src/lib/test-workspace.ts`.
