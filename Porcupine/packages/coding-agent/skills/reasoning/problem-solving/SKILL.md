---
name: problem-solving
description: The universal problem-solving loop for ANY task — understand, recon, decompose, plan, execute one step at a time, verify each, reflect. The umbrella that routes to domain skills. Use as the default operating loop when a task is not trivial.
stack: reasoning
---

# Problem-Solving (The Umbrella)

This is the mental operating system for turning any goal into a *verified outcome*. It is deliberately task-agnostic — it works for coding, writing, research, and operational chores alike. The core doctrine: **done means verified**. A task is not finished when it *looks* done; it is finished when every claim it makes has been checked against reality with a real command, test, or read-back.

Use this skill as the entry point. It routes to, and does **not** duplicate, the domain skills:
- **Code changes** → `/skill:planning-and-task-breakdown`
- **Bugs / failures** → `/skill:root-cause-analysis`
- **Parallel / heavy / independent work** → `/skill:autonomous-delegation`
- **ML measurement** → `/skill:evals-and-models`, and **security** → `/skill:secure-coding` when relevant.

## When to Use

Every non-trivial task — coding, docs, research, debugging, migrations, analysis. Use it *especially* when the goal is ambiguous, multi-step, or irreversible.

Skip it (just do) only for a truly trivial, single-shot action whose success you can see instantly and cannot go wrong.

## Procedure

### 1. Understand — restate the goal AND the success criteria
Before acting, write down in one sentence: *what am I trying to achieve*, and *how will I know it worked?* “Done means verified” — so name the verification upfront (a command passes, a value returns, a file reads back the expected content). If you cannot state the success criterion, you are not ready to act — clarify first.

### 2. Recon — read the real state, never assume
Inspect the actual world before planning. `ls` what is there, `read` the relevant file, `grep` for the symbols/signals that matter. Documentation and memory are hypotheses; the current state is ground truth. If you are exploring a *new or large* codebase where understanding prerequires reading many files, hand the recon to a `subagent` and get a summary back — do not dump dozens of files into the main context.

### 3. Decompose — break it into small, verifiable steps, highest risk first
Split the goal into steps that are each independently checkable, and order them so the *riskiest unknown* comes first (fail early, cheaply). If steps are independent and parallelizable, they are candidates for `/skill:autonomous-delegation`.

### 4. Plan — pick the approach and a verification check per step
For every step, decide the approach *and* the concrete check that proves it — “make X, verify with `bash cmd` / `read file` / run test Y.” A plan without a per-step verification is a wish. This is exactly `planning-and-task-breakdown`'s gate for code; apply the same discipline outside code.

### 5. Execute ONE step at a time
Do not batch steps. One change, then verify, then the next. Batching makes it impossible to attribute success or failure, which is how bugs get born.

### 6. Verify each step with a real command / test / read-back
Run the check you planned. Trust the output, not your memory of what it *should* be. If a step fails verification, go back to Understand/Recon — do not “fix forward” on top of an unverified result. For a fresh, unbiased check that your mental model is not overfitting, a second-opinion `subagent` review is a cheap, powerful tool.

### 7. Reflect — what worked and what to learn
At the end, note what worked, what wasted time, and one takeaway. If anything was hard-won or reusable, record it (e.g. in `literature` / `memory`) so the next task starts one step ahead.

## Decision Rules — when to just-do vs decompose vs delegate vs stop-and-ask

- **Just-do**: trivial, instantly verifiable, cannot go wrong → execute directly.
- **Decompose**: multi-step, ambiguous, irreversible, or > a handful of actions → run the loop above.
- **Delegate** (→ `/skill:autonomous-delegation`): recon needs reading many files (>10); sub-tasks are *independent* (parallelizable); a fresh/unbiased verification or review is warranted; or work is heavy enough to pollute the main context. Pro-tip: exploration of ~10+ files, or ≥3 independent pieces of work, is a strong delegation signal.
- **Stop-and-ask**: requirements are ambiguous such that you cannot define the success criterion; the change is irreversible with no sandbox/rollback; or unexpected security/trust implications surface. Ask rather than guess — guessing here is what burns hours.

## Pitfalls

- Acting before restating the goal and success criterion — the classic “I built it, but is it what you wanted?” failure.
- Skipping recon and assuming the state of the world.
- Batching many changes before verifying any (can't attribute results).
- Declaring victory from memory or “it looks right” instead of running a real verification.
- Re-inventing `planning-and-task-breakdown` or `root-cause-analysis` here — load them.
- Doing heavy, independent work inline when delegation would keep the main context clean and finish faster.

## Verification

- Goal and success criterion stated before any action (“done means verified”).
- Recon done against real files/state (`ls`/`read`/`grep`), or delegated when large.
- Steps ordered with the highest-risk unknown first, each with its own verification check.
- Executed one step at a time; each step's verification run and passed.
- On failure, re-entered Understand/Recon rather than fix-forwarding on unverified output.
- Reflection captured a working takeaway; reusable learnings persisted.
