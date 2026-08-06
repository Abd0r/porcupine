---
name: structured-data
description: Parse, validate, transform, extract from, and safely mutate JSON, CSV, and YAML using node -e and jq when available.
stack: data
---

# Structured Data

Structured files (JSON, CSV, YAML) need deterministic parsing, validation, and transformation that text tools do poorly. This skill covers parsing/validating with `node -e` (always available on a Node agent host) and `jq` when installed, extracting fields, safe mutation, and detecting malformed data — and when to route the work through the `literature`/`tasks` tooling instead.

## When to Use

- Validate that a JSON/CSV/YAML file is well-formed before relying on its contents.
- Extract a field or subset across many records (configs, manifests, test fixtures, datasets).
- Transform or filter structured data (map, filter, aggregate).
- Series-edit one field across many records without hand-editing each.
- Detect malformed, truncated, or encoding-broken data.

## Procedure

1. **Validate before you trust.** 
   - JSON:
     ```bash
     node -e "JSON.parse(require('fs').readFileSync('data.json','utf8')); console.log('valid JSON')"
     ```
     Or, if `jq` exists: `jq empty data.json && echo valid`.
   - YAML (via bash and available tools; otherwise visual check):
     ```bash
     python3 -c "import yaml,sys; yaml.safe_load(open('c.yaml')); print('valid YAML')"
     ```
   - CSV — check header/row consistency and quoting:
     ```bash
     python3 -c "import csv,sys; list(csv.reader(open('d.csv'))); print('parses as CSV')"
     ```
2. **Extract fields.**
   - JSON with `jq`:
     ```bash
     jq '.dependencies' package.json
     jq -r '.items[] | .name' list.json        # -r = raw string, no quotes
     jq 'length' data.json                     # array/object length
     ```
   - JSON with `node -e` (no jq needed):
     ```bash
     node -e "const d=require('./data.json'); console.log(JSON.stringify(d.items.map(i=>i.name)))"
     ```
   - CSV with `node`/`python` stream:
     ```bash
     node -e "const fs=require('fs');const r=fs.readFileSync('d.csv','utf8').trim().split('\n').map(l=>l.split(','));console.log(r.slice(0,5))"
     ```
3. **Transform / filter.**
   - `jq 'map(select(.active)) | sort_by(.price) | .[:5]' data.json`
   - `jq --arg id "$X" '.[] | select(.id==$id)'` — external value injection, quote it.
4. **Morph safely.** Prefer transforming in memory and writing once with `node -e`/`jq > newfile` **to a new path**; only overwrite the source after you have validated the output.
   ```bash
   jq '.counts = (.counts // [] + [0])' data.json > data.new.json
   mv data.new.json data.json   # atomic replace
   ```
   Or for a full rewrite in Node:
   ```bash
   node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync('x.json'));d.a=42;fs.writeFileSync('x.json',JSON.stringify(d,null,2)+'\n')"
   ```
   Note the `null,2` pretty-print — otherwise you'll clobber formatting.
5. **Detect malformed data.** `JSON.parse` throws with a message; wrap it to report the offending line. For CSVs, check row-length consistency on the header row and every line; flag ragged rows. Check encoding/binary junk with `file data.json`.
6. **Route to the right store.** If the structured data is a corpus of papers or a work queue, do not ad-hoc-parse it — use `literature` (add/list/status-track papers) or `tasks` (track work items). Those tools own dedup, statusing, and search; hand-rolled JSON for them is redundant and drifty.

## Pitfalls

- **`jq` absent** — Porcupine hosts may not ship it. `node -e` needs no install; use it as the portable fallback.
- **Pretty-print loss** — non-`null,2` stringify flattens/ruins JSON. Output with indentation.
- **Trailing newline / BOM** — `JSON.parse` fails on a UTF-8 BOM; strip it or use `-r --raw` conventions.
- **CSV ragged or quoted-comma** — naive `split(',')` breaks on quoted commas and multiline fields; prefer a real CSV parser when accuracy matters.
- **Overwriting source before validation** — write to `.new`, validate, then atomic `mv`.
- **Shell-injected strings** — when parameterizing `jq`/SQL-like filters, quote the injected value or use `--arg` so whitespace/special chars do not break the expression.
- **Reaching for structured parsing when the tools suffice** — for one field in one file, `grep`/`read` beat spinning up jq/node.

## Verification

- Re-open the written file with the same parser: `jq empty x.json`/`JSON.parse` of the output passes.
- Spot-check 2–3 extracted values against the raw source (`grep` the source for the expected value).
- For transforms, diff a sample: `diff <(jq ... orig) <(jq ... new)` to confirm only intended fields changed.
- For mutation, `git diff` (if versioned) or by-hand read of the changed field to confirm scope.
