---
description: The workhorse document — a living design for one coherent piece of work, kept in sync with the code it describes.
---

# Working with specs

A spec is a living design document. It describes one coherent piece of work: what it does,
why, and the constraints that shaped it. Write the code and the spec in the same session,
in sync — when you change the behavior, change the spec in the same breath.

## Attach to the feature, focus on the code

When a parent feature exists, the spec inherits its product framing: reference it, then
spend the spec on design and implementation — do not restate the product requirements and
the general idea. A standalone spec (no feature above it) may carry its own short product
framing before diving into the design.

## Keep it current, not historical

Rewrite the spec in place. Git is the history: never append dated change notes ("CHANGED
2026-05-01: no longer X"), never keep superseded paragraphs with strikethrough, never
journal progress inside the spec. A reader must always be able to take the whole document
as presently true. If a rejected approach is worth remembering, that is an ADR.

## The right altitude

Describe behavior, contracts, and constraints — the things a reader cannot recover from
the code alone: why this shape, what was out of scope, what must not break. Code snippets
belong in the spec only when the exact form is the contract (a schema, a wire format, a
public API signature). If a section restates what the code obviously says, remove it.

## Typical structure

Most specs settle on some of: **Goal**, **Context**, **Approach** or **Design**, **Out of
scope**, **Acceptance criteria** or **Verification**. Use the ones the work needs and skip
the rest — an empty heading is worse than no heading.

## Scope discipline

One spec, one coherent problem. When a sub-problem or sibling grows its own weight, create
a new spec and reference it with `depends:` in the frontmatter of the dependent one — do
not split content into overlapping documents that each repeat half the story, and do not
let the spec swallow neighboring problems.

## Small steps inside a spec

Short-lived sub-steps are checklists inside the spec body, not child task documents.
Promote a checklist item to a task file only when it outlives the session, blocks other
work, or needs context of its own.

## Done means true

Mark the spec done (`pm done <id>`) when the code matches it. Before that, a final pass:
does every section still describe what shipped?
