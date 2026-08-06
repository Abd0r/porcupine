---
name: data-analysis
description: Analyze data without fooling yourself - hygiene, distributions, statistics, and honest plots.
stack: sci
---

# Data Analysis

Use this skill before trusting any number computed from data. It covers data hygiene, distribution checks, appropriate statistics, and plots that do not lie.

## When to Use

- Cleaning or analyzing a dataset, computing statistics, or making plots.
- Deciding which statistical test or summary is appropriate.
- Reporting uncertainty, significance, or a comparison of two conditions.

## Procedure

### 1. Hygiene before statistics

1. Inspect the raw data first with `read`/`bash` (head, dtypes, missing counts, value ranges) — never compute on unexamined data.
2. Name columns and files consistently; record units and missing-value conventions in the analysis notes.
3. Split raw (immutable) from cleaned (derived) data; keep the cleaning script.
4. Check for duplicates, impossible values, and leakage between splits before any analysis.

### 2. Look at the shape before the mean

1. For every numeric column: distribution (histogram), range, outliers, and missing rate.
2. Do not report a mean without the distribution — a mean on bimodal or skewed data is misleading.
3. Check per-group sample sizes before comparing groups.

### 3. Choose the statistic for the data

1. Normal, homoscedastic, independent → parametric tests. Otherwise prefer non-parametric or robust statistics.
2. For comparisons: report effect size and confidence interval alongside any p-value; a p-value alone proves nothing.
3. For many comparisons: correct for multiple testing (Bonferroni, Benjamini–Hochberg) and say which.
4. Never decide the test after seeing the result, and never drop data points to make a test pass (report exclusions with reasons).

### 4. Plot honestly

1. Plot the data first (distribution, scatter, per-group box/violin), then summaries.
2. Match the axis scale to the question — a truncated or log-inconsistent axis that exaggerates a difference is a lie.
3. Label units, sample sizes, and error bars (what do they represent — SD, SEM, CI?).
4. Save the generating script with every plot so it can be reproduced.

### 5. Report and verify

1. State sample sizes, exclusions, and the analysis script path in the results.
2. Re-run the headline statistic from the cleaned data with one command; record output.
3. If the result is a comparison, state the test, assumptions checked, effect size, and interval.

## Pitfalls

- Computing summary statistics before inspecting the raw data.
- Reporting a mean on skewed or multimodal data.
- Choosing the test after seeing the result, or p-hacking by dropping points.
- Plotting with a truncated axis to exaggerate a difference.
- Reporting p-values without effect size or intervals.

## Verification

- Every reported number is produced by a saved script from the cleaned data.
- Distribution, sample size, and test assumptions are stated.
- Plots have labeled axes, units, and error-bar definitions and are regenerable.

## Cross-references

- Use `reproducible-experiments` to pin the data version the analysis ran on.
- Use `benchmark-evals` when the comparison is between methods.
- Use `research-writing` when the analysis becomes a results section.
- Use `literature` to cite the statistical methods used.
