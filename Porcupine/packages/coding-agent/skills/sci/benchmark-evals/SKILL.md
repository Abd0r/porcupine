---
name: benchmark-evals
description: Compare methods fairly - baselines, held-out data, leakage prevention, and honest significance.
stack: sci
---

# Benchmark Evals

Use this skill whenever methods are compared on measured numbers — model evals, algorithm benchmarks, A/B tests, or reproduction studies. An unfair comparison is worse than no comparison.

## When to Use

- "Our approach beats X" claims that will be reported or published.
- Running an eval suite, leaderboard entry, or baseline comparison.
- Reviewing an existing evaluation for fairness.

## Procedure

### 1. Define the comparison before running

1. State the metric, the held-out/test split, and the scoring code before any run — pre-register it in the study notes.
2. Select baselines that are actually comparable: same data, same budget (compute, tokens, time), same metric, same conditions.
3. State the evaluation protocol exactly: prompts, few-shot counts, decoding settings, seeds.

### 2. Prevent leakage

1. Split data before any tuning; verify no training/validation information reaches the test split (deduplicate near-duplicates across splits).
2. Check for contamination: benchmark items the model may have seen during pretraining are flagged, not silently kept.
3. Never tune on the test set — tune on validation only, then run the test set once.

### 3. Run and record fairly

1. Run every method (including baselines) with the same harness and scoring code, from the same pinned environment (see `reproducible-experiments`).
2. Record per-item results, not just aggregates — aggregates hide distribution and failure modes.
3. Record the exact commands and seeds per run in `EVIDENCE.md`.

### 4. Report uncertainty honestly

1. Report the number of items, the variance across seeds, and a confidence interval or significance test when comparing.
2. Small differences on small samples are noise — say so rather than ranking.
3. Multiple metrics: state the primary metric before the run; do not cherry-pick the one that flatters.
4. Report failure cases and any items excluded, with reasons.

### 5. Verify

1. The comparison is reproducible: one command re-runs all methods on the same split.
2. No method was given an advantage in data, budget, or scoring that the others lacked.
3. The reported ranking matches a re-run of the recorded commands.

## Pitfalls

- Comparing against a weak or un-tuned baseline while claiming a general win.
- Tuning on the test set or evaluating on data the model already saw.
- Reporting a ranking from a single seed or a handful of items.
- Cherry-picking the metric that flatters the new method.
- Omitting baseline failure modes that the new method inherits.

## Verification

- Pre-registered protocol exists in the study notes; test split was held out before tuning.
- All methods ran through the same harness with recorded commands and seeds.
- Uncertainty (n, variance, CI) is reported with the comparison.

## Cross-references

- Use `reproducible-experiments` to pin the eval environment and run command.
- Use `data-analysis` for the statistics behind the comparison.
- Use `literature-review` to check prior evals and their reported baselines.
- Use `research-writing` when the comparison becomes a results section.
- Use `project-hygiene` to keep the eval protocol and results in a `Project/` workspace.
