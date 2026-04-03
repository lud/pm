# PM Hello — Resume Work Workflow

Use this when no specific work was given and the goal is to continue from where
work was left off.

## Step 1 — Orient

```bash
pm status
pm current
```

If there is **no current document**, list not-done features with
`pm list --type feature` and ask the user which one to work on. Stop here until they
choose.

If there **is** a current document, read it with `pm read <id>` and proceed to
Step 2.

## Step 2 — Evaluate the current document

Based on the doctype and status of the current document, follow the appropriate
branch below.

### Task

- **Active:** Examine the codebase to determine whether the work described in
  the task is already implemented. Report your findings to the user.
  - If the work appears complete, tell the user and ask for confirmation.
  - If the work is incomplete, summarize what is missing or still needed.
- **Blocked:** Tell the user what document is blocked and why (read the
  frontmatter for context). Ask if the blocker has been resolved. If yes,
  unblock it with `pm edit <id> --set status:in-progress` and continue. If no,
  proceed to Step 3 (find next work).
- **Done:** Proceed to Step 3 (find next work).

### Spec

- **Done:** Proceed to Step 3 (find next work).
- **Blocked:** Same as blocked task — report the blocker, ask if resolved, and
  either unblock or proceed to Step 3.
- **Active (including `specified`):** Check for child tasks with
  `pm show <id>`.
  - If tasks exist, pick the first active task — go to Step 2 with that task
    (set it as current first). Skip blocked and done tasks.
  - If no tasks exist, treat the spec as active implementation guidance: read
    it, summarize intent, and either start implementing directly or ask the
    user whether to split it into tasks first.

### Feature

- **Active:** Read the feature content. Provide a summary and check for child
  specs with `pm show <id>`.
  - If no specs exist, suggest starting the specification work — propose specs
    and ask for confirmation.
  - If active specs exist, pick the first one — go to Step 2 with that spec
    (set it as current first).
  - If all specs are done, check implementation across the codebase. If
    everything looks complete, tell the user and ask for confirmation to mark
    the feature as done.
- **Blocked:** Same as blocked task — report the blocker, ask if resolved, and
  either unblock or proceed to Step 3.
- **Done:** Proceed to Step 3 (find next work).

## Step 3 — Find next work

When the current document is done, blocked, or otherwise not actionable, use
`pm next` to find the next workable document. It traverses the hierarchy
starting from the current document, looking for the nearest available leaf
(siblings first, then up to parent siblings, drilling down into children).

```bash
pm next
```

If `pm next` finds a document, set it as current with `pm current <id>` and go
back to Step 2 to evaluate it.

If `pm next` reports nothing left, congratulate the user — all work is done or
blocked.

## Marking documents as done or blocked

When the user confirms that work is finished (e.g. "ok that is done", "yes let's
move on"), mark the document with `pm done <id>` before proceeding to Step 3.

When work cannot proceed due to a dependency or external blocker, mark the
document with `pm blocked <id>` before proceeding to Step 3.

Do **not** batch-update statuses during traversal — only mark a document as done
or blocked when it has been individually evaluated and confirmed.
