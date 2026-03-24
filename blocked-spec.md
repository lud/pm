You had some information in /home/lud/src/pm/spec.md already.

Basically it's like the "done" statuses.

- each doctype can declare blockedStatuses like it can declare doneStatuses. The default is an array with "blocked" string
- the done command is already setting the document status to the first entry in the doneStatuses array
- a new blocked command would do the same, except using first entry of blockedStatuses

Done and blocked statuses are optional. If the config explicitly sets them to an empty array, the done/blocked commands must fail with an explicit error message. So the done command needs update too, in addition of the introduction of
the blocked command.

The list command needs update as well:
* there is a default filter: list only documents who are in an active status (which means neither done nor blocked status category)
* --done flag will only list documents who are in a done status according to their doctype configuration, and disable the default filter
* --active flag will not exist anymore
* --blocked will only list documents who are in a blocked status according to their doctype configuration, and disable the default filter
* --all-statuses (short capital S: -S) will just disable the default filter
* providing both --done and --blocked will yield no result, providing --done and -S is the same as --done, same for blocked

Currently there is logic of supporting --active and --done together. We will remove this, the users are smart enough to understand that --done and --blocked are mutually exclusive

I would like the list command to be refactored as well:

1. First we inspect the arguments, and we generate a list of predicates from the filter, and a document reader function. The predicates are composed into a single filter function
2. The document reader returns data from the file path (id, doctype, path) only, but on step 1, if we add a predicate that will need to see the content (like checking the status), the reader function must also parse the frontmatter.
3. We run the file scan generator function `scanDocuments`, no need to collect all documents in a list. For each document we call the reader function, and pass the result to the filter function. If the filter function returns true, we
add the document to an array of collected documents
1. We return collected documents array to the command module. The command module only transforms CLI arguments into options and formats the result. Sorting of the result must be done by ID, not by doctype as it is now.

The status command needs update too:

For now there is a breakdown of statuse, with done statuses last, and the overall count of active/done on top. We need to add the blocked in there.
Order for counts is: active/blocked/done
Order for statuses is the same.

To sort the statuses, just add them into 3 arrays (active, blocked, done), then concat the array, then use the index as a numerical basis of the status sort.

The "info" command needs update too:

It currently displays the "DONE STATUSES", we should add the blocked statuses before


-- RESPONSES --

1. the status flag is orthogonal, it's just another predicate. We don't care if they are mutually exclusive. So --status foo and --done will likely return no result, except if "foo" is in doneStatuses for some doctype.
2. predicates are AND-composed yes. For now we just turn any option into the corresponding predicate, and compose them as a single function. The only special treatment is if --done, --blocked or --all-statuses are provided, in that case we
remove the default "status is active" filter. Each predicate should be represented as an object with a "filter" function and a "requiresFrontmatter::boolean" property. Then when composing them we can also define the reader function
3. The default command is badly implemented. It should reuse most of the code that the status command uses. Both commands should delegate to the same handled, exported from the status command module. Currently the formatting is different,
this is bad. The only difference is that the default command should have the block with `projectFile === null` before calling the shared code.