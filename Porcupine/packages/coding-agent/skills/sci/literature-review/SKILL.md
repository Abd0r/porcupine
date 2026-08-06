---
name: literature-review
description: Evidence-graded literature search, dedupe, and synthesis with citation trails.
stack: sci
---

# Literature Review

Use this skill when a question, hypothesis, or implementation decision needs evidence from the published literature. It produces a graded, deduplicated reference set with a citation trail — not a keyword dump.

## When to Use

- "What does the literature say about X?"
- Choosing between methods, models, or hyperparameters where published evidence exists.
- Writing the related-work or background section of a paper.
- Checking whether a claimed result or capability actually exists in the literature.

Do not use it for a single known paper lookup (just search and record it with the `literature` tool).

## Procedure

### 1. Frame the search

1. Write one concrete research question with the population, intervention, comparison, and outcome (PICO-style) or equivalent.
2. List 2–4 synonyms and their abbreviations for each key concept.
3. Decide the inclusion window (e.g., last 5 years, or seminal work back to the origin).
4. Record the question and search terms in the study notes before searching — a review is only auditable if the search is reproducible.

### 2. Search multiple sources

1. `web_search` with tight queries per concept; vary the wording for the same concept to surface different hits.
2. For papers behind paywalls, `web_extract` the abstract page (arXiv, DOI landing page, publisher abstract, Semantic Scholar, PubMed).
3. Use `literature` tool `search` first — a paper you already recorded must not be re-added.
4. Chase citations: from each promising paper, extract its cited works and citing works (Semantic Scholar citations endpoint, arXiv references, Crossref) for 1–2 hops.

### 3. Screen and grade

Grade every candidate on evidence quality before inclusion:

| Grade | Meaning |
|---|---|
| A | Peer-reviewed, replicated, or large controlled study |
| B | Peer-reviewed single study or strong preprint with full methods |
| C | Preprint, workshop paper, or technical report with partial evidence |
| D | Blog, tutorial, vendor claim, or unverified source |

1. Read the abstract (and methods when the claim is central) with `web_extract`.
2. Record each paper with `literature` tool `add`: title, authors, year, venue, `doi` or `url`, a one-line `notes` summary, the evidence `grade` (A–D) in the `grade` field, and set `status` to the reading progress.
3. Deduplicate: same DOI, same title, or preprinted + published versions of the same work count as one entry.
4. Flag contradictions: when two sources disagree, keep both and record the disagreement in notes — do not silently pick a side.

### 4. Synthesize

1. Group the graded set by theme or method family.
2. For each group: what is established (multiple A/B sources), what is contested (conflicting sources), and what is missing (no source covers it).
3. State the confidence level of the synthesis and the evidence it rests on.
4. Write the related-work summary only from the recorded entries; every claim gets a citation key.

### 5. Verify the trail

1. Every citation key in the final summary maps to a recorded `literature` entry with a resolvable `doi` or `url`.
2. No claim cites a source it does not actually support (abstract-only claims are marked as such).
3. The search terms and window are recorded so the review can be reproduced or extended later.

## Pitfalls

- Judging a paper by its title or abstract alone when the claim is central — read the methods.
- Treating a preprint or vendor benchmark as equivalent to a peer-reviewed study.
- Re-adding papers already in the `literature` store instead of searching it first.
- Citing a survey or secondary source when the primary paper is available.
- No search log — a review nobody can reproduce is not evidence.

## Cross-references

- Use `research-writing` when the synthesis becomes a paper section.
- Use `reproducible-experiments` when literature claims must be validated by reproduction.
- Use `benchmark-evals` when the review must compare measured results fairly.
- Use `memory` for durable preferences; record papers in the `literature` tool store, not in memory.
- Use `project-hygiene` to keep the study's evidence trail in a `Project/` workspace.
