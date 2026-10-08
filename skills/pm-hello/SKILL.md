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

**Load the `pm-guide` skill before anything else** unless it is already loaded
in this session. This is mandatory, whatever the request: it holds the command
reference, the concept definitions, and the rules about type guides used
throughout this workflow.

**Always** run `pm info` next: it lists this project's document types with
their descriptions and the path of each type's guide. Read a type's guide
before creating or working on documents of that type, as `pm-guide` requires.

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

When the user explicitly asked for the new document, create it without
waiting; otherwise wait for their answer to the proposal.

When the user brings open points or asks to discuss, have the discussion
before writing the body. Share what you researched and your recommendation for
each point, and let the user decide.

In all creation cases, read the created file with your file read tool and
write its body following the guide. When several documents are created at
once, create them all, then fill them one by one; none stays empty at the end
of the session. The body records what the user agreed to; anything else is
written as a proposal or an open question. Set it as current
with `pm current <id>` only when the user is starting that work now — documents
prepared for later stay uncurrent.
