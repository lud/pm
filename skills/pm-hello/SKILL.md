---
name: pm-hello
description:
  Session bootstrap for projects managed with `pm`. Load the pm-guide skill,
  check project status, resume work on the current document, or find the next
  thing to do. Use this whenever the user asks where work stands, what to do
  next, to continue work, to resume a session, for project status, or invokes
  /pm-hello. Also use it when the user describes specific work they want to do
  (a feature, spec, task, or other deliverable) to check whether it is already
  tracked.
user-invocable: true
---

# PM Hello — Session Bootstrap

**Always start:** load the `pm-guide` skill for command reference and concept
definitions used throughout this workflow.

Then choose a mode based on how the skill was invoked.

---

## Mode A — Resume work

Use this when the user wants to continue from where they left off, with no
specific work described (e.g. "what's next?", "resume", "where were we?").

Read [resume-work.md](resume-work.md) and follow its steps.

---

## Mode B — Specific work described

Use this when the user describes a concrete piece of work they want to do — a
feature, spec, task, or any other deliverable — and you need to find out whether
it is already tracked.

### 1 — Search existing documents

List active and blocked documents:

```bash
pm list
```

List blocked documents:

```bash
pm list --blocked
```

Scan both outputs for documents whose title or content matches the user's
described work.

### 2 — Act on the result

**Exact match found** — a document of the right doctype matches the described
work: read it with `pm read <id>` to confirm intent, set it as current with
`pm current <id>`, then evaluate it following the doctype/status rules in
[resume-work.md](resume-work.md) (Step 2 onwards).

**Partial/parent match found** — a document of a *higher* doctype matches (e.g.
the user wants to implement a task but a spec or feature exists that covers the
same area): use that document as the parent when creating the new child. Inform
the user of the match and propose creating the document under it. On
confirmation:

```bash
pm new <type> "<title>" --parent <parent-id>
```

Set the new document as current and continue.

**No match found** — the work is not yet tracked at any level:

- **Feature requested:** propose creating it directly.

  ```bash
  pm new feature "<title>"
  ```

- **Spec or task requested:** these require a parent. You cannot create a spec
  without a feature, or a task without a spec.

  1. List existing candidates as suggestions (e.g. active features for a spec,
     active specs for a task): `pm list --type <parent-type>`.
  2. Present sensible suggestions to the user and ask which to use as the
     parent, or whether to create the required parent first.
  3. Once a parent is confirmed — either selected or freshly created — create
     the document with `pm new <type> "<title>" --parent <id>`.

In all creation cases, set the new document as current with `pm current <id>`
and continue.
