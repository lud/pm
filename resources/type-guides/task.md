---
description: A small, trackable unit of work with a clear done condition — use one when the work outlives the current session or blocks something.
---

# Working with tasks

A task is a unit of work small enough to finish and verify in one sitting, tracked as its
own file because something needs the tracking: it will outlive the current session,
another document `depends:` on it, or it needs context a checklist line cannot hold.

## Prefer checklists first

Sub-steps of work you are doing right now belong as a checklist inside the spec you are
implementing. Reach for a task file when a step is deferred ("do this later, separately"),
when it blocks or is blocked, or when handing it to a future session that will need its
own context.

## Terse is fine — empty is not

A task that earned its own file deserves at least one sentence of body: what to do, when
it counts as done, or where it came from ("Deferred from spec 003: …"). Opening an empty
file wastes the reader's trip — if there is truly nothing to say beyond the title, the
work belonged on a checklist, not in a file. Short title plus a single sentence is
acceptable; more is welcome when the task carries decisions or constraints.

Keep the title short — it becomes the filename. Put the context in the body, not the
title: prefer `Fix CSV export` + a sentence over `Fix the CSV export encoding issue when
the locale uses commas`.

## Done condition

State it in the body when it is not obvious. A task nobody can tell is finished will never
be finished. Mark it with `pm done <id>` the moment it is — stale open tasks poison `pm
ready`.
