---
name: build-and-ci
description: Run a project's real build, typecheck, lint, and test commands, interpret their file:line output, fix root causes, and keep generated files out of commits. Use before claiming a change is done or when CI fails.
stack: build
---

# Build & CI Discipline

Local discipline that keeps CI green and is the fastest feedback loop available. The goal: use the project's *actual* commands, get the smallest failing unit fast, fix the root cause not the symptom, and never commit build output. Complements `test-loop` (the run-until-green quick path); this adds file:line interpretation and a clean-commit protocol.

## When to Use

- Before declaring a code change done, or when CI reports a failure and you want to repro locally.
- After adding/changing code that can break types, lint, or tests.
- When you need to distinguish "my code has a real problem" from "the tooling output confused me."

## Procedure

### 1. Read the project's actual commands first
- `read package.json` (or `pyproject.toml` / `Makefile` / `build.gradle`) to find the real scripts: `build`, `typecheck`, `lint`, `test`, `test:watch`. Note what package manager is used (npm/pnpm/yarn).
- Run the project's commands — **prefer existing scripts over inventing one-off** shell tricks. Respect the intended order: lint → unit tests → build → integration (fast, isolated checks before slow ones).

### 2. Run the smallest relevant unit first
- For a change in one module, target the affected tests/specs rather than the whole suite when a narrow command exists (e.g. `npm test -- path/to/x.spec.ts`). Small, isolated tests give feedback in seconds; the full suite (and integration) run last, or after your focused check passes.
- Reuse any configured cache/test-fixtures so repeated runs stay fast.

### 3. Interpret typecheck / lint / build output as `file:line`
- The output names a file and line/column plus a message. **Read that line** with `read` before editing. The message is the symptom; the cause is usually code directly above the flagged line, a wrong type/logic at the call site, or a missing import.
- Don't blindly auto-fix warnings — decide whether the offending line is wrong or the rule/type is being misread.
- If the build/typecheck is clean but behavior is wrong, that's a logic bug, not a tooling problem — go back to debugging.

### 4. Fix the root, not the symptom
- Fix the actual type or logic error the message points at. Do not silence the check by weakening it, adding `// @ts-ignore`/`eslint-disable` to hide a real issue, or deleting a test you can't fix.
- One change at a time; re-run the same command to confirm. A green run after the fix is the proof.

### 5. Keep generated/untracked outputs out of commits
- Before committing: `bash git status` and check that `dist/`, `build/`, `node_modules/`, coverage, `.cache` and similar generated dirs are ignored (gitignored). Never commit build artifacts.
- If you used `git add -A`, confirm you did not sweep in untracked build output. Prefer staging specific source files.
- If CI is failing on the same job locally, fix locally first and re-run the identical command before pushing — match CI's command, not a looser one.

## Pitfalls

- **Running one-off commands** that bypass the project's real scripts — you can "pass" your own check yet still fail the project's.
- **Full suite always first** — wastes minutes of feedback when you need one module's result.
- **Skipping `read` of the flagged line** and "fixing" blind from the message text without seeing the code.
- **Hiding errors** (downgrading a type, disabling a rule, deleting a failing test) instead of fixing the underlying issue.
- **Committing `dist/` / build output / coverage** — it bloats the repo and derails review.

## Verification

- You ran the project's **documented command** (from package.json/CI config), not your own.
- Typecheck/lint/build pass, and each warning/error you addressed pointed to a root cause you can name with file:line.
- Your focused tests pass; the relevant surrounding tests still pass.
- `bash git status` shows only intended source files — no generated/untracked build output staged.
