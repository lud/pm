---
name: pm-quick-feature
description:
  Capture a feature idea from the current conversation and create a new pm
  feature document with structured notes from that discussion. Use only when the
  user explicitly invokes /quick-feature to park an idea for later. Do not
  auto-invoke this skill for incidental ideas, brainstorming, or speculative
  discussion.
user-invocable: true
disable-model-invocation: true
---

# Quick Feature — Capture an idea from conversation

This skill captures a feature idea that emerged during the current conversation
and saves it as a new `pm` feature document. The idea is not a commitment — it's
a structured snapshot of the conversation so nothing gets lost.

## When this is used

The user is in the middle of working on something and an idea comes up — maybe a
better approach to revisit later, a nice-to-have enhancement, or a concern that
deserves its own feature. They invoke `/quick-feature` to dump it before moving
on.

## Step 1 — Extract from conversation

Review the recent conversation and extract the following. Not every section will
apply — skip sections that have nothing to say. Do not invent information that
wasn't discussed.

- **Idea** — one or two sentences summarizing the core idea.
- **Context** — what were we working on when this came up? What triggered the
  idea? Reference the current document/task if there is one.
- **Current state** — if a quick/dirty solution was implemented (or already
  exists), describe what it is and why it's not the final answer.
- **Possible approaches** — solutions that were mentioned in the conversation.
  Present these as options, not decisions. Use phrasing like "could use…", "one
  option is…", "worth investigating…".
- **Technology candidates** — specific libraries, protocols, services, or
  patterns that were mentioned. List them as candidates to evaluate, not
  choices.
- **Concerns** — risks, trade-offs, or doubts raised by the user or by you.
  Things like "this might be overkill", "adds a dependency", "latency impact".
- **Scope boundaries** — what's explicitly out of scope or not needed right
  away.
- **Affected areas** — files, modules, or systems that would likely be touched.
- **Priority signal** — any indication of urgency or importance. Could be "nice
  to have", "will become necessary if X", "legal might require this", etc.
  Default to "nice to have" if nothing was said.
- **Rejected alternatives** — approaches that were considered and dismissed,
  with the reason why.

## Step 2 — Confirm with the user

Present a short summary (title + 2–3 bullet points) and ask the user to confirm
or adjust before creating the document. The title should be concise and
descriptive — a noun phrase, not a sentence.

## Step 3 — Create the feature

```bash
pm new feature <Title> --status idea
```

Use the status `idea` to distinguish these from actively planned features.

Then open the created file and write the structured content using this template:

```markdown
## Idea

{one or two sentences}

## Context

{what triggered this — reference current work if applicable}

## Current state

{what exists now, if anything, and why it's not sufficient}

## Possible approaches

{bulleted list of options discussed — framed as candidates, not decisions}

## Technology candidates

{libraries, protocols, patterns mentioned — framed as things to evaluate}

## Concerns

{risks, trade-offs, doubts}

## Scope boundaries

{what's out of scope}

## Affected areas

{files, modules, systems}

## Priority

{urgency signal, defaults to "Nice to have"}
```

Drop any section that has no content. Do not add sections beyond what was
discussed.

## Step 4 — Resume

After creating the feature, tell the user the document ID and path, then go back
to whatever was being worked on before. Do not set the new feature as the
current document.
