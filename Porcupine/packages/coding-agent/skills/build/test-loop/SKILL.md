---
name: test-loop
description: Build, typecheck, and test until green.
stack: build
---

# Build & Test Loop

## When to use

After code changes, before claiming done, CI failures.

## Procedure

1. Detect package manager (package.json → npm/pnpm/yarn; pyproject → pytest)
2. Prefer project scripts: `npm test`, `npm run build`, `npm run typecheck`
3. Run the smallest relevant suite first, then broaden on failure
4. Fix root cause; re-run the same command to verify
5. Report real command output, not guesses

## Pitfalls

- Do not skip verification after edits
- Prefer existing scripts over inventing one-off commands
