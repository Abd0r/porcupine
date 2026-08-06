---
name: code-review-and-quality
description: Review local changes for correctness, risk, and maintainability.
stack: coding
---

# Code Review and Quality

Review local diffs or a named change before commit, push, or completion. This skill complements `github-code-review`: use that skill for remote PR mechanics and comments.

## When to Use

- Before presenting a non-trivial code change as complete.
- Reviewing an uncommitted diff, branch, patch, or local implementation.
- Assessing correctness, tests, compatibility, security, performance, or scope.

## Procedure

1. Inspect `git status`, the change summary, and commits using `bash`.
2. Read the task or intended behavior, then read tests before implementation where available.
3. Inspect each changed file in surrounding context with `read`; never judge solely from a diff hunk.
4. Evaluate the five axes:
   - correctness and failure modes;
   - tests and regression coverage;
   - architecture, clarity, and compatibility;
   - security and trust boundaries;
   - performance and resource bounds.
5. Categorize findings: blocking, important, or optional. Explain the causal risk and propose a concrete remedy.
6. Run the relevant validation commands and inspect the final diff with `git diff --check`.

## Review Rules

- Review the claimed behavior, not just style.
- Prefer findings that can cause wrong results, data loss, security exposure, crashes, or incompatible APIs over nits.
- Do not approve a change only because the diff is small or tests exist.
- Flag test gaps when they would let the reported bug class return.
- Do not conflate unrelated pre-existing changes with the reviewed scope.

## Pitfalls

- Recommending a rewrite without identifying an actual fault or benefit.
- Treating lint output as proof of correctness.
- Reviewing generated artifacts while skipping source changes.
- Missing an unbounded loop, unvalidated external input, silent fallback, or leaked secret because the happy path looks clean.

## Verification

The review states the inspected range, commands run, findings by severity, and any remaining unverified risk.
