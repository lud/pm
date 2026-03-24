# Spec: Deterministic Init and Next/Blocked Workflow

## Goals

- Make project initialization deterministic and non-interactive, without deep-merge defaults
- Establish a first-class blocked status concept alongside active and done.
- Provide a reliable command to move work forward to the next actionable document.
- Make traversal decisions understandable to users and agents.
- Ensure agent-facing skills promote a consistent workflow centered on next-step navigation.

## Rationale

- Deep merging defaults creates project setup that is hard to understand and test.
- A blocked state is necessary to distinguish "not done but currently not actionable" from active work.
- Users and agents need a predictable way to find the next document without manually traversing hierarchy each time.
- Explainable traversal improves trust and reduces ambiguity in automated workflows.
- Shared skill guidance should reflect the actual command semantics to prevent incorrect agent behavior.

## Requirements

### Initialization

- `pm init` must be non-interactive. Interactivity will come back once the project is stable.
- If no `.pm.json` exists, `pm init` must create a complete explicit default configuration including schema metadata.
- If `.pm.json` exists and schema metadata is missing, `pm init` must add schema metadata.
- If `.pm.json` exists and already has schema metadata, `pm init` must not rewrite unrelated content.
- `pm init` must ensure `.pm.current` is present in `.gitignore` without duplicate entries.

### Status Model

- Doctype configuration must support both done-status values and blocked-status values.
- Status classification must distinguish three categories:
  - Active
  - Blocked
  - Done
- Default behavior must treat blocked as non-active and non-done.

### Core Document Operations

- The system must support marking a document as blocked.
- Marking blocked must use the doctype’s configured blocked-status semantics.
- Existing done-marking behavior must remain consistent with doctype configuration.

### Listing and Summary Semantics

- Default document listing must show active work only.
- Listing must support explicit blocked filtering.
- Status summaries must report active, blocked, and done counts.
- Per-status summary rows must indicate whether a status is blocked or done.

### Next Traversal Semantics

- A traversal operation must resolve the next actionable document using leaf-first hierarchy traversal.
- Traversal must support considering the current document as effectively done or effectively blocked for the purpose of choosing the next target.
- Traversal must support explain events that describe visited nodes and terminal outcomes.
- Traversal must be deterministic for a given project state.

### Next Command Behavior

This command finds the next document to work on. It does not change the "current" document, just returns information.

- Default output must communicate both current effective state and resolved target.
- Explain output must in addition present intermediate traversal information in a user-meaningful order.

### Skills and Guidance

- Agent skills must prioritize `pm next` as the primary navigation command to find more work. A dedicated README section about finding work would be helpful.
- Skills must include a concise fallback decision workflow in case `pm next` does not return anything satisfying.

### Verification Requirements

- Behavior must be validated by automated tests.
- Tests must cover initialization scenarios, blocked status semantics, traversal behavior, command output modes, and hierarchy traversal across parent/sibling/grandparent cases.
- Manual verification should not be required to validate core contract behavior.
