---
name: reproducible-experiments
description: Run experiments anyone can reproduce - seeds, pinned env, versioned data, full-run verification.
stack: sci
---

# Reproducible Experiments

Use this skill when a result must be verifiable by another person or another session: an experiment, benchmark run, ablation, or numerical claim. A result without a reproduction path is an anecdote.

## When to Use

- Running experiments, ablations, sweeps, or benchmarks whose numbers will be reported.
- Any claim of the form "X improved by Y%" or "our method beats Z".
- Handing a research workspace to another session or collaborator.

## Procedure

### 1. Pin the environment before the first run

1. Record exact dependency versions: lockfiles (`package-lock.json`, `requirements.txt` + hashes, `conda-lock`) and runtime (Node/Python/compiler versions) in the study notes.
2. Record the dataset version and source — a dataset URL without a commit or version is not pinned.
3. Set a fixed global seed policy (default seed, per-experiment seed derivation) and record it before any run.

### 2. Make data immutably versioned

1. Keep raw data read-only; derived artifacts go in separate directories.
2. Name artifacts with content or run identity: `run-<experiment>-<seed>-<timestamp>`.
3. Record data provenance (source, version, hash, preprocessing script) in `EVIDENCE.md` (see `project-hygiene`).
4. Never overwrite a prior run's output — every run writes to its own directory.

### 3. Run with a single command

1. Provide one command that reproduces an entire run from scratch: `npm run experiment:<name>` or a script that installs, fetches, runs, and writes results.
2. Run it end-to-end at least once before claiming anything — a partially executed pipeline is not reproducible.
3. Log seeds, versions, and git commit of the code at run time into the run manifest.

### 4. Record and verify

1. Write the measured numbers into `EVIDENCE.md` with the exact command that produced them.
2. For the headline result, re-run once and compare — record both runs.
3. Verify determinism where claimed: same seed + same env → same numbers. If not deterministic, state the variance.

### 5. Hand off

1. The study workspace contains: pinned env, versioned data, the single run command, run manifests, and `EVIDENCE.md` with every reported number traceable to a run.
2. Another session can run the single command in a fresh checkout and obtain numbers comparable to the recorded ones.

## Pitfalls

- Reporting numbers from a run whose seed, versions, or dataset are unknown.
- Saving "final results" over a raw-data directory.
- A long experiment executed in pieces that nobody ever ran end-to-end.
- Copying plot images into notes without the generating script and data.
- Claiming determinism without re-running once.

## Verification

- `EVIDENCE.md` maps every reported number to a run directory and a single command.
- A fresh clone + the one command reproduces comparable numbers.
- Raw data, derived artifacts, and results live in separate, versioned locations.

## Cross-references

- Use `benchmark-evals` when comparing methods fairly; use `data-analysis` before trusting summary statistics.
- Use `project-hygiene` for the `EVIDENCE.md` and study workspace conventions.
- Use `literature` to record the prior work the experiment builds on.
