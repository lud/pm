# pm

Lightweight spec-driven development for software developers working with AI
coding assistants.

Every new agent session starts cold. You re-explain the plan, or the agent
reads a long `TODO.md` and burns context on it, and the specs it wrote last week
have quietly drifted from the code.

pm gives your project a backlog and a spec store that live in the repository,
as plain markdown files. Your agent asks `pm ready` what can be worked on, loads
only the document it needs, does the work, keeps the spec in sync with the code
and marks it done. The next session, yours or a subagent's, picks up from there
with a request as short as "let's do pm 56".

The CLI manages the files, their links, statuses and queries. The skill that
comes with it teaches your agent to use them: read the documents it needs, and
keep them up to date as it works.

No server, no database, no account, no subscription: files and git. This
repository is managed with pm itself, see [`context/pm/`](context/pm/).

## Where pm fits

Spec-driven development (SDD) means writing down what to build and how, in
documents the agent reads and keeps up to date, before and while it writes the
code. Most SDD frameworks turn that into a pipeline: a set of phases, each with
its own slash commands, specialised agents, prompt templates and hooks, which
you learn and then follow.

pm keeps the documents and drops the pipeline:

- **A tool, not a methodology.** pm stores and queries documents. It does not
  decide when you write a spec, plan, implement or review. You organise the
  work the way you already do, and build your own workflow on top if you want
  one.
- **Almost nothing to learn or install.** One skill (an instruction file that
  coding agents such as Claude Code or Codex load to learn a tool) teaches your
  agent the commands and loads by itself. Two optional slash commands start a session and
  save an idea for later. Everything else is the agent running `pm` in a shell,
  like any other CLI.
- **The agent learns from the tool itself.** Instead of a stack of prompts,
  pm points the agent at a short guide for each document type. Edit a guide or
  add your own types, and the agent follows the new rules.
- **Any size of work.** A one-line idea, a small task and a 500-line design sit
  in the same tree. A bug fix doesn't go through the ceremony of a new product
  feature.
- **One document per topic, edited in place.** A spec is rewritten as the
  design changes, with git as its history. There are no proposal files to merge
  back into it later.
- **Nothing to migrate away from.** Stop using pm and your documents are still
  readable, greppable, versioned markdown.

## Built for coding agents

pm was shaped by watching Claude Code and Codex use it across real projects.

**Sessions start in one or two calls.** "Let's do pm 56" is enough: the agent
runs `pm show 56`, gets the document's path, its parent and its children, and
starts working. `pm ready` answers "what's next?" as a small tree. No one reads
the whole backlog.

**It costs almost nothing.** Getting oriented at the start of a session costs a
few hundred tokens, and the agent only ever opens the documents it works on.

**Documents come out right.** When the agent creates a document, pm tells it
where that type's guide is and that the body is still empty. Agents follow
it: in every session we reviewed, they read the guide and wrote a real body. Features stay about the product,
specs hold the design, tasks state when they are done.

**Work happens in the right order.** A document can depend on others and stays
out of `pm ready` until they are done. When the agent finishes one, it can tell
you what just got unblocked and what should come next.

**Delegation is cheap.** Numbers are all a subagent needs: "specs 31, 37, 40"
or "pm 51" is a complete briefing, because each document carries its own
context.

**Specs are memory.** Because specs are kept in sync with the code, a later
session can answer a design question from the spec alone, or notice that a
document already exists instead of writing a duplicate.

**The tree keeps itself tidy.** pm is built for a solo developer working on
several branches, possibly with several agents in parallel. When a merge brings
two documents with the same number, or files end up in the wrong place,
`pm tidy` shows a plan that renumbers, renames, moves and rewrites the
references between documents. Apply it with `--force`.

## What pm is not

- **Not a team issue tracker.** There is no assignment, discussion or
  notification. pm works next to GitHub Issues or Linear, not instead of them.
- **Not a guarantee.** pm makes it easy for the agent to keep documents
  current, and its skill asks it to, but the agent does the writing.
- **Not a link checker for prose.** `pm tidy` rewrites the links in each
  document's YAML header (`parent`, `depends`), not the numbers mentioned in
  the text.

## Quickstart

Requires Node.js 20.12 or later.

```bash
npm install -g '@lud/pm'                      # the CLI
npx skills add lud/pm -a claude-code -g -y    # the skills, for all your projects
cd your-project && pm init                    # creates pm.json and context/pm/
```

For another agent, replace `claude-code` with its name, for example `codex`,
`cursor` or `opencode`
([full list](https://github.com/vercel-labs/skills)). Restart your agent session
so it picks up the new skills.

Or let your agent do it. Paste this prompt:

> Install the pm project management CLI globally with
> `npm install -g '@lud/pm'`, then its skills globally with
> `npx skills add lud/pm -a <your agent> -g -y`, then run
> `pm init --directory context/pm` at the root of this repository. When done,
> tell me to restart the session so the new skills are loaded.

Then just talk to your agent: "create a feature for user authentication and
split it into tasks", "what's next?", "let's do pm 4".

## Crash course

What your agent does behind the scenes, if you want to drive pm yourself.

Create documents. Each gets a number, and `--parent` puts it under another one:

```console
$ pm new feat User authentication
Created context/pm/001.feat.user-authentication.md
Guide: …/type-guides/feature.md
Body is empty: read the file with your file tool before writing it.
$ pm new spec Session design --parent 1
$ pm new task Login form --parent 1
$ pm new task Session storage --parent 1
```

`pm new` only writes the metadata: open the file and write what the document is
about. Then make the login form wait for the session storage:

```console
$ pm edit 3 --set depends:4
```

`pm ready` lists what can be worked on now: documents that are not done or
blocked, and whose dependencies are all done. The login form is not there yet:

```console
$ pm ready
feat 001 User authentication (new)
  spec 002 Session design (new)
  task 004 Session storage (new)
```

Mark the current work, finish it, and the login form becomes ready:

```console
$ pm current 4
$ pm done 4
context/pm/004.task.session-storage.md → done
Cleared current document.
$ pm ready
feat 001 User authentication (new)
  spec 002 Session design (new)
  task 003 Login form (new)
```

## Concepts

**Documents** are markdown files named `{number}.{type}.{title}.md`, for
example `001.feat.user-authentication.md`. The number is unique across the
project and is how you and your agent refer to a document (`1`, `01` and `001`
all work). Status, parent and dependencies sit in a YAML header at the top of
the file:

```markdown
---
title: Login form
status: new
created_on: 2026-03-23
parent: 001.feat.user-authentication
depends: [4]
---

Email + password form, wired to the session store from 004.
```

Add any other key you like: `pm edit <id> --set key:value` sets it and
`pm list --is key:value` filters on it.

**Types** are labels, not structure: any type can sit under any other, as deep
as you like. A common shape is a feature, with specs for its design and tasks
for the smaller pieces, but nothing enforces it. `pm init` sets up five:

| Type      | Tag    | Purpose                                                                     |
| --------- | ------ | --------------------------------------------------------------------------- |
| `feature` | `feat` | A unit of product value: the idea, the problem, product decisions           |
| `spec`    | `spec` | A living design for one coherent piece of work, kept in sync with code      |
| `task`    | `task` | A small unit of work with a clear done condition                            |
| `adr`     | `adr`  | An architecture decision record: the chosen option, the alternatives, why   |
| `note`    | `note` | Free-form knowledge worth keeping, with no workflow                         |

Each type comes with a **guide**, a short markdown document telling the agent
what belongs in that type and how to structure it. The built-in guides are in
[`resources/type-guides/`](resources/type-guides/). Point a type to your own
guide, or turn it off, in `pm.json`.

**Groups** are plain directories named `{number}.{name}/` that collect related
documents and files such as images or data. Create one with `mkdir`, using an
unused number; documents join it with `--parent`.

**Statuses** are free text. `pm.json` says which ones mean done and which mean
blocked, for all types or per type. Everything else counts as active, and
finished work stays out of the default listings. `pm done` sets a type's first
done status, so on an ADR it sets `accepted`. Use
`pm edit <id> --set status:rejected` for the others.

`pm init` also adds `.pm.current`, which records the document you are working
on in this checkout, to `.gitignore`.

## Configuration

`pm.json` sits at the root of your repository. This is the one `pm init`
creates:

```json
{
  "$schema": "https://cdn.jsdelivr.net/gh/lud/pm@main/resources/pm-project.schema.json",
  "directory": "context/pm",
  "types": {
    "feature": { "tag": "feat" },
    "spec": { "tag": "spec" },
    "task": { "tag": "task" },
    "adr": {
      "tag": "adr",
      "defaultStatus": "proposed",
      "doneStatuses": ["accepted", "rejected", "superseded"]
    },
    "note": { "tag": "note", "doneStatuses": ["archived"] }
  }
}
```

Only `directory` is required. The `$schema` line gives your editor completion
and validation for the other options: default, done and blocked statuses,
number padding, and a custom `guide` path (or `false`) per type.

## Commands

Run `pm <command> --help` for details.

| Command                       | Purpose                                                  |
| ----------------------------- | -------------------------------------------------------- |
| `pm init`                     | Create `pm.json`                                         |
| `pm info`                     | Types, their guides and statuses                         |
| `pm status`                   | Counts per type and status, plus the current document    |
| `pm list`                     | Active documents, with filters                           |
| `pm ready`                    | What can be worked on now, as a tree                     |
| `pm show <id>`                | Title, status, path, parents and children                |
| `pm read <id...>`             | Print documents                                          |
| `pm which [id...]`            | Print document paths                                     |
| `pm current [id]`             | Show or set the current document                         |
| `pm new <type> <title...>`    | Create a document                                        |
| `pm edit <id>`                | Change status, parent, type or any other field           |
| `pm done <id>`                | Mark done                                                |
| `pm blocked <id> [--by <id>]` | Mark blocked, optionally by another document             |
| `pm tidy [--force]`           | Fix numbering, file names, locations and references      |

## Skills

The [`skills/`](skills/) directory holds the agent skills, instruction files
that coding agents load to learn a tool:

- **`pm-guide`** teaches the agent the commands and the workflow. It loads by
  itself in projects that use pm.
- **`/pm-hello`** starts a session: it resumes the current document, finds the
  next thing to do, or checks whether the work you describe is already tracked.
- **`/pm-quick-feature`** saves an idea from the conversation as a feature
  document, for later.

The skills only describe plain CLI usage, so they work with any agent that can
run shell commands. Install them per project instead of globally by dropping
the `-g` flag from the `npx skills` command.

## Development

```bash
npm install
npm run dev -- <command>   # run from source with tsx
npm test                   # vitest
npm run typecheck
npm run build
```

With [`just`](https://github.com/casey/just): `just install` builds and symlinks
`dist/main.js` into `~/.local/bin/pm`, and `just check` runs formatting, tests
with coverage, build, schema generation, Biome and the type check.

See [`CLAUDE.md`](CLAUDE.md) for architecture notes and testing conventions.
This repository's project file is `pm-dev.json` rather than `pm.json`, selected
by `PMFILE=pm-dev.json` in `.envrc`.

## License

Apache-2.0
