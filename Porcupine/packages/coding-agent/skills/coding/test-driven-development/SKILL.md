---
name: test-driven-development
description: Prove behavior changes with red-green-refactor tests.
stack: coding
---

# Test-Driven Development

Use tests as executable evidence for new behavior and bug fixes. The default cycle is RED → GREEN → REFACTOR, adapted to the repository’s actual test framework.

## When to Use

- Implementing logic, changing behavior, or fixing a regression.
- A reported bug can be expressed as a failing automated test.
- A public contract, edge case, or invariant must remain stable.

Do not require a new test for documentation-only edits or behavior-free formatting changes. Explain if a behavior change cannot be tested and use the best available executable probe.

## Procedure

1. Read the manifest, CI files, and neighbouring tests with `read` and `grep`.
2. Identify the repository’s focused-test command; do not assume `npm test`, `pytest`, or any global runner.
3. Write a concise test that specifies the intended observable behavior.
4. Run it and confirm it fails for the expected reason. A passing test before any fix is not evidence of a regression.
5. Implement the smallest code change that makes the test pass.
6. Re-run the focused test.
7. Refactor only with the test green, then re-run it.
8. Run the broader relevant suite before claiming completion.

## Test Design Rules

- Assert contracts and invariants, not incidental implementation details.
- For a bug, reproduce the reported failure before fixing it.
- Include boundaries: empty values, invalid input, error paths, compatibility paths, and concurrency only when relevant.
- Avoid catalog snapshots and stale data assertions that fail on expected updates.
- Prefer deterministic unit tests; add integration or end-to-end tests only where the defect crosses that boundary.

## Pitfalls

- Writing code first and a test that merely confirms the current implementation.
- Mocking the very boundary that caused the integration bug.
- Calling an assertion “coverage” when it cannot fail for a realistic regression.
- Treating an unrun test as a test.

## Verification

Report the RED command/result, GREEN command/result, and broader verification command/result. If RED could not be demonstrated, say why.
