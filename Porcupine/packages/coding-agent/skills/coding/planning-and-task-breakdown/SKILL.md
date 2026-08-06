---
name: planning-and-task-breakdown
description: Turn multi-file changes into verified implementation slices.
stack: coding
---

# Planning and Task Breakdown

Plan multi-file or high-risk work before editing. A plan is an executable map of real repository paths, contracts, tests, and verification commands, not a prose wish list.

## When to Use

- A task spans multiple files, subsystems, or public interfaces.
- Requirements are ambiguous, changes are irreversible, or a migration is involved.
- The task needs separate implementation and verification milestones.

Skip formal planning for a narrow, isolated edit whose test and call path are already obvious.

## Procedure

1. Read project instructions and manifests with `read`.
2. Locate the relevant symbols, entry points, call sites, and existing tests with `grep` and `find`.
3. State the current behavior, intended behavior, constraints, and non-goals.
4. List exact files to create or modify only after verifying their existence and responsibilities.
5. Divide work into vertical, independently verifiable slices. Lead with the highest-risk unknown.
6. For every slice, name: interface/contract, change, focused test, broader verification, and rollback boundary.
7. Do not edit until the plan is coherent. For very large work, save a plan in the repository only when the user asks for a durable artifact.

## Task Quality Gate

Each task must answer:

- What concrete behavior changes?
- Which existing symbol or path proves where to modify?
- Which test fails before the change or demonstrates the gap?
- Which command verifies the slice afterward?
- What is deliberately outside scope?

## Pitfalls

- Plans with invented paths, types, or function names.
- A task named “add error handling” without a failure case.
- Horizontal mega-phases that leave the project broken until the end.
- Combining refactor, new behavior, and unrelated cleanup in one slice.

## Verification

- Every referenced path and interface was inspected.
- Each slice can be tested independently.
- Requirements map to a specific slice; unknowns and risks are surfaced, not hidden.
