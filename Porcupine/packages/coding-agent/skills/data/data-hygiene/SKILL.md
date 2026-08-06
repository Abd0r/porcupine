---
name: data-hygiene
description: Run a data-quality gate before drawing conclusions — inspect distributions, check for missing/duplicate/sensitive values, validate schema, and aggregate honestly.
stack: data
---

# Data Hygiene

A conclusion is only as good as the data it rests on. Before you compute an aggregate, publish a count, or assert a trend, run this gate: is the data complete, consistent, de-duplicated, sanitized, and aggregated in a way that does not mislead? Skip it and your numbers quietly lie.

## When to Use

- Before computing any aggregate, average, count, or percentage from a dataset.
- When ingesting an unfamiliar CSV/JSON/export — check its shape before trusting it.
- Before releasing or sharing data — verify no secrets and no sensitive fields leak.
- When a number looks off and you must find which data-quality problem caused it.

## Procedure

1. **Inspect the shape and distribution.**
   - JSON/CSV: print heads and per-field value counts with `node -e` or `jq` (see structured-data):
     ```bash
     node -e "const fs=require('fs');const r=fs.readFileSync('d.csv','utf8').trim().split('\n').map(l=>l.split(','));console.log('rows',r.length-1,'cols',r[0].length);console.log(r.slice(0,3))"
     ```
   - Check value ranges and frequency: `jq 'group_by(.field) | map({field:.[0].field, n:length})' d.json` for one common column.
2. **Check for missing values.** For each column, count empty/`null`/`NA`/`""`. Flag any column with a non-trivial missing share — a column that is 80% null cannot back a global average. In Node/`jq`, count `null` and `""` per field.
3. **Check for duplicates.**
   - Identify natural unique keys (an id, a name+date). Count `group_by(key) | map(select(length>1)) | length` duplicates.
   - Decide whether duplicates are legitimate (repeat events) or corrupt (same record repeated). De-duplicate only after confirming which.
4. **Scan for sensitive/PII and secrets.** Before handling or sharing, grep the data for known risk patterns: emails, phone patterns, API keys/tokens, credit-card-like numbers, credentials. Mask or drop columns you do not need. When in doubt, treat as sensitive and do not leak into logs or writes.
   ```bash
   grep -rniE "[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|(sk-[A-Za-z0-9]{20,})|AKIA[0-9A-Z]{16}" .
   ```
5. **Validate the schema.** Confirm the columns/count and types you expect (sales totals are numeric, dates parse, ids unique where the contract says unique). A schema mismatch (string in a numeric field, shifted header) makes every downstream number wrong.
6. **Aggregate honestly.**
   - Report **n** with every aggregate and the coverage it represents (e.g. "mean = 5.1 across 90 of 100 records").
   - Flag skew before trusting a mean: outliers pull means; consider median/quartiles for skewed data.
   - Validate arithmetic on small or empty subgroups — a 1-row "average" is noise, not signal.
   - Do not silently drop missing values from the denominator and claim 100% coverage.
7. **Sanitize and lock in.** Write cleaned data to a new path (not the source), record the cleaning steps (counts before/after), and prefer `literature`/`tasks`-style tracking for provenance if the dataset is a recurring corpus or work queue rather than an ad-hoc spreadsheet.

## Pitfalls

- **Mean over skewed or missing data** — the classic misleading aggregate.
- **Confusing "not present" with "zero"** — `null`/`""` is not `0`; treat missing explicitly.
- **Duplicate rows inflating counts** and "unique" claims that are false.
- **Sensitive data leaking** through un-redacted writes, logs, or shared outputs.
- **Schema drift** — a header shift makes every column mislabeled; validate headers/column counts explicitly.
- **Dropping missing data silently** and reporting coverage as if full.
- **Tiny subgroups presented as trends** — always state n.

## Verification

- You can cite, per relevant column: row count, missing count, unique-key dup count, range/type, and any masking applied.
- Any aggregate you report states **n** and coverage; skewed distributions are summarized with median or flagged outliers, not just mean.
- A sensitive-data scan produced no red flags (or the flagged fields were explicitly masked/removed).
- Cleaning steps are reproducible and applied to a fresh output file, not the source.
