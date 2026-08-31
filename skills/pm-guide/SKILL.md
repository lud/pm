---
name: pm-guide
description:
  Guide for using the `pm` project management CLI in any pm-managed project. Use
  this whenever you detect a `pm.json` file or when the user mentions project
  documents, current work, project status, or project management, even if they
  do not explicitly ask for `pm` help.
user-invocable: true
---

# PM — Project Management CLI Guide

PM organizes project documentation as markdown files with YAML frontmatter in a
flat structure. It is designed for solo developers working with AI coding
assistants. The project file is `pm.json` at the repository root; all documents
live under the single directory it configures.

## Core concepts

### Documents

A document is a markdown file named `{ID}.{tag}.{slug}.md`, for example
`001.feat.user-auth.md`.

- The **ID** is a globally unique integer across all documents and groups.
  Zero-padding is display only: `1`, `01`, `001` all refer to the same
  document, and commands accept any form. Prefer padded IDs in output to the
  user — they match the filenames.
- The **tag** names the document's type (see Types below).
- The **slug** derives from the title.

### Groups

A group is a bare directory named `{ID}.{slug}/` at the root of the documents
directory — no frontmatter, no status, no type. Groups collect related
documents and untracked resources (images, data files). They share the global
ID sequence with documents and can be a `parent`, the `current` node, and a
`--parent` target.

### Types and their guides

Types are labels, not structure: any type can parent any type, and changing a
document's type never moves it. The project's types are declared in `pm.json`.

**Discover them with `pm info`**: each type is listed with its tag, its status
configuration, a one-line description, and the path of its **guide** — a
document explaining how that type is meant to be used and structured.

**Read the guide before creating or substantially editing a document of a
type you have not worked with in this session.** `pm new` also prints the
guide path after each creation. The guide is the authority on that type's
content doctrine; this skill only covers the mechanics shared by all types.

Commands accept a type by name or by tag interchangeably (`pm new feat …` ≡
`pm new feature …`).

### Statuses

Statuses are free-form strings. The project configures global
`doneStatuses` and `blockedStatuses` (with optional per-type overrides —
`pm info` shows them), which classify every document as **active**,
**blocked**, or **done**. Anything not done and not blocked is active.

### Frontmatter

```yaml
---
title: Login flow
status: new
created_on: 2026-03-23
parent: 001.feat.user-auth
depends: [12, 034.task.data-model]
---
```

- `parent` — a document (`{id}.{tag}.{slug}`) or a group (`{id}.{slug}`).
  A bare numeric ID is accepted as shorthand; `pm tidy` normalizes it.
  Omitted for root documents.
- `depends` — optional list of document IDs or refs this document waits on.
  `pm ready` hides a document until its dependencies are done. Groups cannot
  be depended on.
- Any other key is yours to add (`pm edit <id> --set key:value`); `pm list
  --is key:value` filters on them.
- The document **ID is not in the frontmatter** — it comes from the filename.

### Placement follows the parent

Frontmatter is the source of truth; file location is derived from it. A child
of a document sits in the same directory as its parent; a child of a group
sits inside the group directory; a parentless document sits at the root.
`pm new` places files correctly. After manual moves or renames, run `pm tidy`
(dry-run by default, `--force` to apply) — it heals locations, filenames, and
references.

### Current document

PM tracks the node being worked on in `.pm.current` (a document or a group).
Never edit that file directly — use `pm current [id]`. Completing the current
document with `pm done` clears it.

## Commands

Run any command with `--help` for full usage details.

```bash
pm info                    # Types, their descriptions and guides, statuses, directory
pm status                  # Counts per type + current document details
pm list                    # Active documents (default: not done, not blocked)
pm list --type <t>         # Filter by type name or tag
pm list --done             # Done documents only
pm list --blocked          # Blocked documents only
pm list --all-statuses     # Everything
pm list --parent <id>      # Direct children of a document or group
pm list --status <s>       # Exact status (any category)
pm list --is key:value     # Filter by frontmatter property
pm show <id>               # Title, status, path, parents and children
pm current [id]            # Show or set the current node
pm which [id...]           # Print document/group paths (no args: project dir)
pm ready                   # Actionable work as a tree (see below)
pm read <id...>            # Print raw contents (for humans; agents: see below)
pm new <type> Title words  --parent <id> --status <s> --set key:value
pm edit <id> --set key:value --parent <id> --type <t> --update-slug
pm done <id>               # First done status; unblocks dependents; clears current
pm blocked <id> [--by <id>]# First blocked status, optional blocker ref
pm tidy [--force] [--no-interactive]  # Heal IDs, refs, locations (dry-run by default)
pm init [--directory <d>]  # Create pm.json (flag skips prompts)
```

## Reading documents: agents use file tools

To read a document as an agent, resolve its path with `pm which <id>` (or take
it from `pm show`/`pm new` output) and read the file with your native file
tools — you must read the file anyway before you can edit it. `pm read` exists
for humans and quick terminal inspection.

## Typical workflow

1. **Start**: `pm info` to learn the types, then `pm current` for ongoing work
   or `pm ready` for the actionable tree.
2. **Load context**: `pm show <id>` for relations; `pm which` + file reads for
   content; read the type's guide if you haven't yet.
3. **Do the work** — and keep the document in sync with the code as you go.
   Documents are rewritten in place; git is the history (guides note the
   exceptions).
4. **Mark the outcome**: `pm done <id>` when complete, `pm blocked <id>` when
   stuck, `pm edit <id> --set status:<s>` for anything else.
5. **Continue**: `pm ready` for what's next; `pm current <id>` to switch.

### `pm ready`

Shows every actionable document as an indented tree: not done, not blocked,
and with all `depends:` satisfied. Done or blocked ancestors of actionable
work appear as context with their status shown; groups appear above their
actionable members; the current node is marked `[current]`.
`--with-blocked` also reveals blocked and dependency-waiting documents. The
command never changes the current document.

## Tips for agents

- `pm new` needs no quotes around the title — trailing words are joined.
- Always pass `--parent` when the work belongs under an existing document or
  group; parentless documents are top-level by design, not by accident.
- To change a document's type: `pm edit <id> --type <t>` (renames the file's
  tag). To fix a filename after a title change: `pm edit <id> --update-slug`.
- Use `depends:` instead of splitting content across overlapping documents:
  `pm edit <id> --set depends:<other-id>` keeps both focused and `pm ready`
  sequences them.
- Keep `pm current` pointing at what you work on — the next session picks up
  from there.
- If IDs, refs, or file locations look inconsistent, run `pm tidy` (dry-run)
  and show the user the plan. When applying as an agent, always use
  `pm tidy --force --no-interactive` — without the flag, ambiguities open an
  interactive prompt meant for humans. With it, ambiguities are warned and
  left untouched for you to resolve with `pm edit`.

## When implementing documents

- **Don't repeat spec content as code comments.** The pm document is the
  spec — duplicating its requirements, acceptance criteria, or descriptions
  as comments above the implementing code adds noise and drifts out of sync.
  Write comments only when the code itself would be unclear without them.
