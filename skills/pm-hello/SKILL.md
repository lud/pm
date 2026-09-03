---
name: pm-hello
description:
  Session bootstrap for projects managed with `pm`. Load the pm-guide skill,
  check project status, resume work on the current document, or find the next
  thing to do. Use this whenever the user asks where work stands, what to do
  next, to continue work, to resume a session, for project status, or invokes
  /pm-hello. Also use it when the user describes specific work they want to do
  to check whether it is already tracked.
user-invocable: true
---

# PM Hello — Session Bootstrap

**Always** load the `pm-guide` skill for command reference and concept
definitions used throughout this workflow.

**Always** run `pm info` first: it lists this project's document types with
their descriptions and the path of each type's guide. Read a type's guide
before creating or working on documents of that type.

Then choose a mode based on how the skill was invoked.

---

## Mode A — Resume work

Use this when the user wants to continue from where they left off, with no
specific work described (e.g. "what's next?", "resume", "where were we?").

Read [resume-work.md](resume-work.md) and follow its steps.

---

## Mode B — Specific work described

Use this when the user describes a concrete piece of work they want to do and
you need to find out whether it is already tracked.

### 1 — Search existing documents

```bash
pm list
pm list --blocked
```

Scan both outputs for documents whose title matches the described work; read
promising candidates (resolve paths with `pm which`, read with your file
tools) to compare intent.

### 2 — Act on the result

**Match found** — a document covers the described work: read it, set it as
current with `pm current <id>`, and continue with the evaluation steps of
[resume-work.md](resume-work.md).

**Related document found** — an existing document or group covers the same
area at a broader level: propose creating the new document under it. On
confirmation:

```bash
pm new <type> <title> --parent <id>
```

**No match found** — the work is not yet tracked. Pick the type whose
description (from `pm info`) fits the work, read its guide, and propose the
creation to the user. Parents are optional: attach the document under a
related node when one exists, create it top-level otherwise.

In all creation cases, read the created file with your file read tool and
write its body following the guide (never leave it empty). Set it as current
with `pm current <id>` only when the user is starting that work now — documents
prepared for later stay uncurrent.
