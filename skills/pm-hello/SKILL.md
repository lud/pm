---
name: pm-hello
description:
  Session bootstrap for projects managed with `pm`. Load the pm-guide skill,
  check project status, resume work on the current document, or find the next
  thing to do. Use this whenever the user asks where work stands, what to do
  next, to continue work, to resume a session, for project status, or invokes
  /pm-hello.
user-invocable: true
---

# PM Hello — Session Bootstrap

This skill bootstraps a working session. It figures out where work was left off,
evaluates the current document, and either continues work or finds the next
thing to do.

**Prerequisite:** auto-load the `pm-guide` skill for command reference and
concept definitions used throughout this workflow.

## Step 1 — Orient

```bash
pm status
pm current
```

If there is **no current document**, list not-done features with
`pm list -t feature` and ask the user which one to work on. Stop here until they
choose.

If there **is** a current document, read it with `pm read <id>` and proceed to
Step 2.

## Step 2 — Evaluate the current document

Based on the doctype and status of the current document, follow the appropriate
branch below.

### Task

- **Not done:** Examine the codebase to determine whether the work described in
  the task is already implemented. Report your findings to the user.
  - If the work appears complete, tell the user and ask for confirmation.
  - If the work is incomplete, summarize what is missing or still needed.
- **Done:** Proceed to Step 3 (find next work).

### Spec

- **Status is not `specified`:** Read the spec content. Provide a brief summary
  and either suggest additions or ask the user if the spec is complete. If the
  user confirms it is complete, mark it as done with `pm done <id>`.
- **Status is `specified`:** Check for child tasks with `pm show <id>`.
  - If tasks exist, pick the first not-done task — go to Step 2 with that task
    (set it as current first).
  - If no tasks exist, suggest splitting the spec into tasks. Propose a
    breakdown and ask the user for confirmation before creating them.

### Feature

- **Not done:** Read the feature content. Provide a summary and check for child
  specs with `pm show <id>`.
  - If no specs exist, suggest starting the specification work — propose specs
    and ask for confirmation.
  - If specs exist but some are not done, pick the first not-done spec — go to
    Step 2 with that spec (set it as current first).
  - If all specs are done, check implementation across the codebase. If
    everything looks complete, tell the user and ask for confirmation to mark
    the feature as done.
- **Done:** Proceed to Step 3 (find next work).

## Step 3 — Find next work

When the current document is done (or has just been marked done), traverse the
hierarchy to find the next piece of work. The traversal is:

1. **Children first.** Check if the current document has undone children
   (`pm show <id>`). If so, pick the first not-done child.
2. **Siblings.** Look at the parent (`pm show <parent-id>`) to find sibling
   documents that are not done. If one exists, pick it.
3. **Walk up.** If all siblings are done, move to the parent and repeat from
   step 2 — check the parent's siblings via the grandparent, and so on.
4. **Root level.** At the top of the hierarchy, list not-done features
   (`pm list -t feature`). If any exist, present them to the user and ask which
   to work on.
5. **All done.** If no undone documents remain anywhere, congratulate the user.

When a new document is selected, set it as current with `pm current <id>` and go
back to Step 2 to evaluate it.

## Marking documents as done

When the user confirms that work is finished (e.g. "ok that is done", "yes let's
move on"), mark the document with `pm done <id>` before proceeding to Step 3.

Do **not** batch-update statuses during traversal — only mark a document as done
when it has been individually evaluated and confirmed.
