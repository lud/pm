# PM Hello — Resume Work Workflow

Use this when no specific work was given and the goal is to continue from where
work was left off.

## Step 1 — Orient

```bash
pm current
```

If there **is** a current node, load it and proceed to Step 2. If it is a
group, look at its children (`pm show <id>`), propose the most advanced active
child as the working document, and on confirmation set it as current.

If there is **no current node**, run `pm ready` to see all actionable work as
a tree. If the tree makes the next step obvious (e.g. a single actionable
leaf), propose it to the user and set it as current on confirmation. Otherwise
ask the user which document to work on. Stop here until they choose.

## Step 2 — Evaluate the current document

Read the document (resolve the path with `pm which <id>`, read the file with
your file tools) and its type's guide if you haven't in this session. Then
branch on status:

- **Done:** proceed to Step 3 (find next work).
- **Blocked:** report the blocker (`blocked_by` in the frontmatter, plus any
  reason recorded in the body). Ask whether it is resolved. If yes, unblock
  with `pm edit <id> --set status:in-progress` and treat as active. If no,
  proceed to Step 3.
- **Active:** establish where reality stands relative to the document:
  - Check the codebase against what the document describes. If the work
    appears complete, say so and ask for confirmation to mark it done. If it
    is partially done, summarize what remains and continue the work.
  - Check children (`pm show <id>`): when active children exist, propose
    descending into the most advanced one (set it as current) rather than
    working the parent directly.
  - Keep the document in sync with the code as you work, following its
    type's guide.

## Step 3 — Find next work

```bash
pm ready
```

Review the tree. If an obvious next document stands out (e.g. a sibling of the
finished one, or the next child under the same parent), propose it, set it as
current with `pm current <id>`, and go back to Step 2.

If several candidates compete and the choice isn't obvious, present the
options and ask the user.

If `pm ready` reports no actionable documents, run it again with
`--with-blocked` to check whether everything is blocked rather than done, and
report accordingly.

## Marking documents as done or blocked

When the user confirms that work is finished (e.g. "ok that is done", "yes
let's move on"), mark the document with `pm done <id>` before proceeding to
Step 3 (this also clears it from `pm current` if it was current).

When work cannot proceed due to a dependency or external blocker, mark the
document with `pm blocked <id> --by <blocker-id>` (or record the reason with
`--set` properties) before proceeding to Step 3.

Do **not** batch-update statuses during traversal — only mark a document as
done or blocked when it has been individually evaluated and confirmed.
