---
name: root-cause-analysis
description: Debug systematically instead of guess-and-patching — reproduce first, isolate one variable, read the actual error at file:line, and verify the fix with a real command. Use for any bug, test failure, or unexpected behavior.
stack: reasoning
---

# Root Cause Analysis

Symptom fixes are failure. Random changes waste time and spawn new bugs. The Iron Law: **no fix before root-cause investigation.** Fix at the source, never at the symptom, and only claim success once a real command proves it.

## When to Use

- Any bug, test failure, crash, or unexpected behavior.
- Especially when a “quick fix” seems obvious, you already tried fixes, or you are under time pressure (systematic is *faster* than thrashing).
- Build failures, integration issues, flaky tests, regressions.

Do not skip it because “the bug is simple” — simple bugs have root causes too.

## Procedure

1. **Reproduce first.** Trigger it reliably before touching anything. If you cannot reproduce it consistently, gather more evidence with instrumentation — do not guess. Record the exact command and input that triggers it. "`grep` the failure, don't guess the cause."
2. **Read the actual error, not the summary.** The traceback already names the file, line, and code. `read` the referenced file at the exact `file:line`; `bash` the failing command with full stderr visible (`2>&1`). Never build a theory from a truncated/echo of the error.
3. **Isolate variables — change one thing at a time.** Check recent changes first: `git diff`, `git log --oneline -5`. For a multi-component system (workflow → build → sign), instrument each boundary (`echo`/`env | grep` at each layer) to find *which* component fails, then drill into it. Do not bundle multiple fixes into one attempt — you cannot tell what worked.
4. **Trace data flow backward from the bad value.** Find where the wrong value originates; walk each caller up the stack with `grep`/`read` until you reach the source. Fix the source, not the consumer that merely trips over it.
5. **Form one falsifiable hypothesis:** “I think X is the root cause because Y.” Test it with the smallest possible change. Yep → proceed; nope → form a new hypothesis, do not stack more changes.
6. **Verify the fix with a real command.** Re-run the failing command and watch it pass. Then run the wider test/typecheck suite to confirm no regression: `npm test` / `npm run typecheck` / the repo's CI command. A fix that does not make the original failing command pass is not a fix.
7. **Stop at 3 failed fixes and question the architecture.** If each fix just surfaces a new problem elsewhere, the pattern may be wrong — stop and reconsider the design instead of a 4th guess. (~95% of “no root cause” cases are actually incomplete investigation.)

## Pitfalls

- Proposing a fix before Phase 1 (reading errors, reproducing).
- “Just try X and see if it works” — you are guessing, not reasoning.
- Multiple changes in one attempt so success cannot be attributed.
- Skipping the failing-test-first step; untested fixes don't stick.
- Fixing at the symptom (the failing consumer) when the bad value comes from upstream.
- Claiming success without re-running the original failing command.

## Verification

- The failure reproduced with a documented, single command.
- Narrative names the failing `file:line` from a real `read`, not a guess.
- Exactly one variable changed per attempt.
- The original failing command now passes, and the wider test/typecheck suite is green.
- If 3+ fixes failed, the architecture was reconsidered, not brute-forced again.
