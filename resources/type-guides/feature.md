---
description: A unit of product value — the container for the specs that design it and the place where an idea is captured until work starts.
---

# Working with features

A feature names a unit of product value and anchors the specs that design it. It answers
*what the user gets and why it matters* — the product side. How it is built belongs in its
specs.

## Two legitimate sizes

- **Idea capture**: a title, a status like `idea`, and a few lines of intent. A near-empty
  feature is healthy — it is a parking spot, not a debt. Flesh it out when work actually
  starts.
- **Product brief**: goal, the user problem, product decisions and their reasons,
  boundaries. Keep it at product altitude.

## Stay at the product level

The feature comes first: it says what the product should do and why, before anyone designs
how. Keep it at that level as work progresses — ideation, product requirements,
user-facing behavior, product decisions. Architecture and implementation content belongs
in the specs that attach to the feature, so the feature stays readable as the statement of
intent.

## Structure hints

**Goal**, **Problem** or **Motivation**, **Decisions**, **Scope** / **Out of scope**. Use
what fits; a one-paragraph feature needs no headings at all.

## Lifecycle

Create children with `pm new <type> "Title" --parent <feature-id>`. Mark the feature done
when its shipped specs add up to the value it promised — a feature with live specs stays
open.
