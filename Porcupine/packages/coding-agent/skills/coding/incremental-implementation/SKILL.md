---
name: incremental-implementation
description: Build multi-file changes as small verified vertical slices.
stack: coding
---

# Incremental Implementation

Implement one complete, testable behavior at a time. Keep the repository buildable after every slice and avoid speculative architecture.

## When to Use

- A feature, refactor, or bug class spans more than one file.
- A change has risky integration boundaries or can be divided into independent behaviors.
- More than roughly one focused edit is needed before verification.

## Procedure

1. Follow `planning-and-task-breakdown` when the design is not already settled.
2. Select the smallest vertical slice: one contract, one behavior, one proof.
3. Add or update the focused test first when behavior changes.
4. Make the minimum required code edit with `edit` or `write`.
5. Run the focused test/build command using `bash`.
6. Inspect `git diff` and `git diff --check`; verify no unrelated files changed.
7. Only then begin the next slice. Do not commit, push, or create a PR unless the user requested it.

## Design Rules

- Prefer simple explicit code over a new abstraction for one use case.
- Extend an existing interface before adding a parallel manager, hook, or configuration path.
- Keep incomplete work disabled or unexposed rather than shipping partial behavior.
- Separate feature changes from mechanical refactors whenever possible.
- Preserve backwards compatibility unless the user explicitly authorizes a breaking change.

## Pitfalls

- Writing a large feature in one pass before running anything.
- “Cleaning up” nearby code outside task scope.
- Leaving a broken intermediate state for a later agent to repair.
- Treating a passing typecheck as proof of runtime behavior.

## Verification

For every slice: focused test passes, relevant build/typecheck passes when applicable, and the diff contains only the intended behavior.
