1. If there is no starting document, we should have a function to select by id 1, if not exists 2, if not exists 3, etc. This function should be quick and not scan all files. For now I suggest to just output a "no current document error".
2. --done-current, --done-blocked, ignore this. It was flags to edit the current document and set the next as current. For now we only implement a finder that does not perform edits or change current. We will add this on further iterations.
3. output mode, forget about --quiet, not useful for now. We just want to support a --verbose flag (instead of --explain)
4. traversal algorithm detailed below. You will have to challenge it
5. core logic in a core module yes, could be its own module since we will have multiple functions probably. The command module handles the cli-to-object options conversion and output formatting.


So, traversal algorithm. The goal of the command is to find the next workable document.
So first it will ignore all documents that are in a done/blocked status.

We will describe tree visiting, so the "current" word may be overloaded. For the document pointed at by the algorithm at any moment I will use the term "cursor".

In general, when you finish a task, you want to work on the next task. Preferably, a related task, if possible. In our current scope that translates to a task of the same spec. If there is no such task, then we should work on the next spec. And if that spec already has tasks, then rather work on the tasks. And if there is no next spec, then on the next feature, etc.

Also, if there is no next task under the spec, but the spec itself is not "done", we could select the spec itself. But my take is that since it was split into tasks, the spec is probably "specified", and the user wants all the tasks "done" to set it as "done". Our tool will not know about custom statuses like "specified" (spec work is done but status is not a done status) or "ongoing" (could work more on the spec). Our tool only know that a spec is in a "done" status or not (or blocked, but for this algorithm it's the same as "done": we ignore it – as a leaf, we can look for children though.) There is tension here, I used to define "specified" as a "done" status, but not anymore. I want my "specified" specs to show in default lists, because we can still work on them by creating tasks, or do the implementation right away. So, if there is no task under the spec, we want to ignore the parent spec because we cannot know if the active status means work or not. This forces a workflow from parent to top: work on spec first, then not touch it and work on tasks, instead of allowing to go back and forth between the spec and its tasks. This is clearly a limitation but I guess reasonable.

Overall, that means we will only consider the leafs.

An an important detail, we will not return the current document, even if not done. The "next" command can be used to "peek" for the next task.

The algorithm is a tad complex.

step 1. set the current document as the cursor
step 2. get the siblings of the cursor under the same parent. This means all the documents under the same parent (there could be different doctypes), excluding the current one. We do want to select IDs that are inferior, as documents are not always worked on by ID order. We will also exclude the done/blocked tasks.
step 3.a If there is no sibling, set the cursor on the parent document and immediately rerun step-2 (so for instance with specs we do not select the parent spec but its sibling spec or other direct feature child)
step 3.a If there is still an item in the filtered results, place the cursor on the that document
step 4.a If the cursor document does not have children, then the search is done and we return the cursor.
step 5.b If the cursor has children, select the children with the same filtering rules s(not done/blocked).
step 6.a If there is a child, the child becomes the cursor and we repeat steps 4/5 (search for children)
step 6.b If there is no available child (wheras child document exist, but none selectable), then the cursor is not a leaf, so we loop to step 2.

Now there is an edge case, for instance with spec 10, tasks 11 and 12, and spec 20 and tasks 21,22. starting on task 11, we see that task 12 is not available, we set the cursor on spec 10, lookup siblings (say both specs belong to the same feature), then find spec 20, check for children, none available, check for siblings, we find back spec 10, which has children with one available: task 11. But that is our starting point.

So we must collect visited nodes and add them to our exclusion filter function, so we ignore them once visited. The only exception is that on step 3, we want to force setting the cursor on the parent because we know we will immediately run step 2 and change that cursor. Ideally we would have a single operation, like "findSiblingOfParent", so we do not have to code our way ignoring the filter for one ID.

What are your thoughts on this? I believe it will become much more clear if we can setup unit tests because we will see by text the system state and have a clear vision of what it can select. Heck, you could even show me state representations by printing TestSetup snippets (each document as one line, only parent and status properties, plus pmCurrent value) and ask me what should be the selected next, to see if we have a common understanding

