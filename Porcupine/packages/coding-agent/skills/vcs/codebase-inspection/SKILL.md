---
name: codebase-inspection
description: LOC and language breakdown with pygount or cloc.
stack: vcs
tags: [loc, pygount, metrics, codebase]
---

# Codebase Inspection

## When to use

LOC, language mix, code vs comment ratios, "how big is this repo".

## Setup

```bash
python3 -m pip install --user pygount 2>/dev/null || pip install pygount
# optional: brew install cloc
```

## Summary

```bash
cd /path/to/repo
pygount --format=summary \
  --folders-to-skip=".git,node_modules,venv,.venv,__pycache__,.cache,dist,build,.next,.tox,.eggs,vendor,coverage" \
  .
```

Always skip dependency/build dirs or it crawls forever.

## Filters

```bash
pygount --suffix=py,ts,tsx --format=summary --folders-to-skip=".git,node_modules,dist" .
```

## cloc fallback

```bash
cloc . --exclude-dir=node_modules,dist,build,.git,venv
```

## Pitfalls

- Generated bundles inflate LOC — exclude dist/
- Compare like-for-like when tracking growth
