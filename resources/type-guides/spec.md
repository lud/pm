---
description: The workhorse document — a living design for one coherent piece of work, kept in sync with the code it describes.
---

# Working with specs

A spec is a living design document. It describes one coherent piece of work: what it does,
why, and the constraints that shaped it.

A spec usually precedes its code, often by days and almost always by more than one
session. Writing it *is* the work for as long as it takes: ending a day with a drafted
spec and no code is a normal outcome, and the next session starts from the document rather
than from memory. What must hold is the other direction — code and spec never disagree for
long.

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

## Challenge the spec before you build it

The first thing to do when implementing a spec is not to write code. It is to read the
spec against what it will actually be built on — the dependencies as they are installed,
the interfaces as they really behave, the surrounding code as it is really shaped — and
build a working model of the whole change before committing to any of it.

A finished spec can be entirely coherent and still wrong, because a document cannot check
its own assumptions. This pass looks for the gap between the design and reality:

- an assumption that no longer holds — a version, a capability, a behaviour the spec
  reasoned from;
- a contradiction between two sections that only appears when you try to satisfy both;
- a step that turns out to need an unusual, awkward, or unsafe construct to work at all;
  friction like that is evidence about the design, not a detail to absorb;
- work the spec expects of itself that belongs to another document, or the reverse.

Each of these is an occasion to stop and tell the user, before any code exists. This is
the cheapest moment in a spec's life to change its mind: nothing is built yet, so nothing
has to be thrown away and no sunk cost is arguing for a patch.

**Read the findings together, not one at a time.** A list of small problems is often one
problem wearing several disguises: when they all trace back to the same construct, that
construct is what is wrong, and fixing each symptom locally preserves the mistake while
making it harder to see. Every local fix looks reasonable on its own — which is precisely
what makes the pattern easy to miss. Name the pattern, propose the remodelling, and let
the user choose between patching and rethinking.

Expect to loop. Challenging the design, reworking the spec, and projecting the reworked
version again is the ordinary path from a drafted spec to code worth writing — not a sign
that the spec was written badly.

## When the code diverges, the spec moves

Implementation surfaces what design cannot. When the code ends up departing from the spec
— and assume there was a good reason, usually a problem nobody could foresee — the spec is
what gets corrected, in the same session, as part of the same work. A spec that quietly
stops describing its code is worse than no spec, because it is still believed.

Correcting it is not a local edit. One section can be holding up another, and a reader
takes the whole document as presently true, so after each change re-read the spec entire
and ask whether it still makes sense. When the divergence undermines something the spec
argued for — a constraint, a boundary, a decision it justified — do not quietly reshape the
document around it. Say what no longer holds and let the user decide what the spec should
now say.

## Done means true

Mark the spec done (`pm done <id>`) when the code matches it. Before that, a final pass:
does every section still describe what shipped?

The sync obligation runs *until* done, not forever. While the spec is active, spec and code
must not disagree for long — that is the whole point of the two preceding sections. Once it
is done it becomes a snapshot of what shipped, and from then on the code evolves naturally
past it: later work does not have to chase every change back into a done spec, and a done
spec is not a live contract the code is bound to. When a done area is picked up again, the
right move is usually a new spec (or reopening this one to `in-progress`), not silently
editing a document that already served its purpose. So a neighbouring spec being done is not
a reason to go back and cross-update it — amend the model, add the migration, and let the
done spec stand as the record of its own moment.
