---
description: An architecture decision record about the code — the chosen option, the rejected ones, and why; product decisions belong in features.
---

# Working with ADRs

An ADR records one decision about the code: what was chosen, what was rejected, and why.
It exists so a future reader (or session) does not reopen a settled question without
knowing what settling it cost. Product decisions are not ADRs — record those in the
feature.

## The one type you do not rewrite

Unlike specs, an accepted ADR is a record: its content stays put. When reality changes,
write a new ADR and mark the old one `superseded` — the chain of superseded ADRs *is* the
useful history. (Fixing wording or adding a clarifying sentence is fine; changing the
decision is not. The **Outcome** section is the one place reserved for later writing.)

## Structure hints

- **Context** (the forces at play)
- **Decision** (one paragraph, active voice: "We use X"),
- **Outcome** (do NOT write this section at creation — it is reserved for the future: come
  back months later to record how the decision played out, and, when superseding, both the
  why and the what: what replaces it — a reference to the new ADR, or the technology
  change)
- **Consequences** (what becomes easier, what becomes harder)
- **Alternatives considered** — for each rejected option, keep its pros as well as why it
  lost, so a future revisit knows exactly what was given up. Short is a feature: half a
  page is a good ADR.

## Lifecycle

Starts as `proposed`; `pm done <id>` marks it `accepted`. Set `rejected` or `superseded`
by editing the status. When superseding, also point at the replacement with a frontmatter
attribute: `superseded_by: <other_id>` (`pm edit <id> --set superseded_by:<other_id>`).
Reference the ADR from specs by its ID when a design leans on it.
