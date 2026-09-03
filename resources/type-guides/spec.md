---
description: The workhorse document — a living design for one coherent piece of work, kept in sync with the code it describes.
---

# Working with specs

A spec is a living design document for one coherent piece of work: what it does, why, and
the constraints that shaped it. It stays true to the code for as long as it is active.

## Design, not product

When the spec has a parent feature, the feature already holds the product framing.
Reference it and spend the spec on design and implementation choices. A standalone spec
may open with a short statement of the requirement, then move on to the design. Either
way, the bulk of the document is how it is built.

## The right altitude

Describe behavior, contracts, and constraints: the things a reader cannot recover from the
code alone. Why this shape, what is out of scope, what must not break. Include code only
when the exact form is the contract (a schema, a wire format, a public API signature).
Remove any section that restates what the code obviously says.

## Structure

Most specs use some of: **Goal**, **Context**, **Design** (or **Approach**), **Out of
scope**, **Acceptance criteria** (or **Verification**). Use the ones the work needs. An
empty heading is worse than no heading.

## One spec, one problem

When a sub-problem or a sibling grows its own weight, create a new spec and reference it
with `depends:` in the frontmatter of the dependent one. Do not split one story across
overlapping documents, and do not let a spec swallow neighboring problems.

## Checklists inside, tasks outside

Short-lived sub-steps are a checklist in the spec body, not child documents. Promote an
item to a task when it outlives the session, blocks other work, needs context of its own,
or when the implementation must ship a placeholder or dummy because the real thing depends
on another spec or feature.

## Keep it current, not historical

Rewrite the spec in place. Git is the history: no dated change notes, no strikethrough, no
progress journal. A reader must be able to take the whole document as presently true. A
rejected approach deserves an ADR only when the choice has a cost worth remembering;
otherwise drop it.

## Check it against the codebase before you stop

Before ending the writing session, read the spec against what it will be built on: the
dependencies as installed, the interfaces as they really behave, the surrounding code as
it is really shaped. Look for assumptions that do not hold, sections that contradict each
other once both must be satisfied, steps that would need an awkward or unsafe construct,
and work that belongs in another document. When several small findings trace back to one
construct, name that construct and propose a remodel rather than patching each symptom.
Report what you find to the user and rework the spec. Surprises during implementation are
still normal; this pass removes the ones that were visible in advance.

## When the code diverges, the spec moves

Implementation surfaces what design cannot. When the code departs from the spec, correct
the spec in the same session, then re-read it whole: one section may have been holding up
another. When the divergence undermines something the spec argued for (a constraint, a
boundary, a justified decision), do not quietly reshape the document around it. Say what
no longer holds and let the user decide.

## Done means true

Mark the spec done (`pm done <id>`) when the code matches it, after a final pass over
every section. Once done, the spec is a snapshot of what shipped: later work does not
back-port changes into it. To pick the area up again, write a new spec or reopen this one.
