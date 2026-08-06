---
name: systematic-debugging
description: Reproduce, isolate, root-cause, and fix bugs with evidence instead of guessing. Use for any test failure, stack trace, regression, or unexpected behavior before proposing a fix.
stack: debug
---

# Systematic Debugging

**Core principle: find the root cause before fixing.** Symptom-patching is failure. Follow the four phases in order — skipping to "the obvious fix" is how bugs return and how regressions multiply. Complements `repro-fix` (the compact version); use this one for anything not instantly obvious.

## When to Use

- Any failing test, stack trace, build error, or "it used to work."
- A reported bug whose cause you do not yet understand.
- Intermittent / flaky failures, or code that works locally but fails in CI — these need evidence, not guesses.
- Especially when you're under time pressure or a "quick fix" looks obvious — those are exactly when the method earns its cost.

## Procedure

The four phases must run in order. **No fixes before Phase 1 completes.**

### Phase 1 — Read the real error + reproduce

1. **Read the error text you actually have.** Note the `file:line`, error code, and full stack. Do not skip a warning; they often name the cause. Find the first frame inside *your* repo (not framework internals).
2. **Reproduce it consistently.** Identify the exact command that fails — `read package.json` / look for a test or script, then run it via `bash` with `grep`/`read` to confirm what it runs. Ask: does it fail every time, or only under conditions (env var, data, timing, OS)?
3. **Check what changed.** `bash git diff` and `bash git log --oneline -10` for recent commits touching the failing area; new deps, config, or env. A regression usually maps to a recent change.

### Phase 2 — Isolate (shrink the space)

- **Binary search.** If `git diff` is large, bisect the change history: `bash git bisect start` / `git bisect bad` / `git bisect good <known-good-commit>`, run the failing command at each step, mark `good`/`bad` until the culprit commit is found. Or bisect *code*: comment out / narrow halves of the failing module and see which half still fails.
- **Grep to locate.** Use `grep -rn` for the offending identifier, config key, or error token to find every site involved. Trace a bad value back through callers with `read` (who calls this with the bad input?).
- **Minimal repro.** Strip the failing case to the smallest input/snippet that triggers it, so unrelated code stops polluting the picture.

### Phase 3 — Instrument (prove where it breaks)

- Add temporary `echo`/`print`/log statements **at component boundaries** — log what data enters a function and what leaves it, at each layer of a multi-component failure (API → service → DB; CI → build → sign). Run once to see *which* boundary breaks before investigating it.
- **Form one hypothesis** — "X is the root cause because Y" — then test it with the smallest possible change or probe. One variable at a time. If it doesn't hold, form a new hypothesis; do not pile on more changes.
- When you don't understand the cause, say so, and research more (types, docs, similar working code via `grep`) rather than guessing a fix.

### Phase 4 — Fix smallest, verify with the original command

1. Apply the **smallest** change that addresses the root cause — no "while I'm here" refactors.
2. **Re-run the exact original failing command.** A fix is a claim; the original command is the proof. Then run the neighboring suite to check you broke nothing.
3. If the fix fails: stop, count attempts. If you've tried 3+ distinct fixes, stop and question the architecture rather than making a blind 4th change.
4. Optionally add a regression test so the bug cannot silently return.

## Pitfalls

- **Fixing before investigating** — "no fixes without root cause." Symptom patches hide the bug and come back.
- **Shotgun editing** multiple files "until one works"; you lose which change mattered.
- **Ignoring the env/context** (versions, config, OS) — a bug can be environment-specific, not code-specific.
- **Multiple simultaneous changes**; you cannot tell what fixed it.
- **Claiming fixed without re-running the original failing command.**

## Verification

- You can state the **root cause** in one sentence with `file:line` evidence.
- The **original failing command now passes** via `bash`, and you re-ran it to confirm.
- Nearby tests still pass; if added, the regression test failed *before* and passes *after*.
- You did not touch unrelated files.
