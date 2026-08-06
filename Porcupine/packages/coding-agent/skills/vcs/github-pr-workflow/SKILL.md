---
name: github-pr-workflow
description: "PR lifecycle: branch, commit, push, open, CI, merge."
stack: vcs
tags: [github, pr, pull-request, ci, merge, branch]
---

# GitHub PR Workflow

## When to use

End-to-end feature/fix PR. Conflicts → `github-pr-conflicts`. Review quality → `github-code-review`.

## Prerequisites

`github-auth`. Repo with GitHub remote. Porcupine tools: `bash`, `read`, `edit`, `write`.

## 1. Branch

```bash
git fetch origin
git checkout main 2>/dev/null || git checkout master
git pull --ff-only
git checkout -b feat/short-description
```

Prefixes: `feat/`, `fix/`, `refactor/`, `docs/`, `ci/`.

## 2. Change and commit

Edit with `read` / `edit` / `write`, then:

```bash
git status
git diff
git add path/to/files
git commit -m "type: short summary

Why this change. What it does."
```

Do not commit secrets (`.env`, keys, `auth.json`). Avoid blind `git add .`.

## 3. Push

```bash
git push -u origin HEAD
```

## 4. Open PR

```bash
gh pr create --fill
# or:
gh pr create --title "title" --body "## Summary
...

## Mechanism
...

## Test plan
- [ ] ..."
```

Draft: add `--draft`.

## 5. CI and iterate

```bash
gh pr checks
gh pr view --json statusCheckRollup,mergeable,url
gh run list --branch "$(git branch --show-current)" --limit 5
gh run view RUN_ID --log-failed | tail -100
```

Fix, commit, push. No force-push to shared branches unless the user asks.

## 6. Merge (only if asked)

```bash
gh pr merge --squash --delete-branch
```

## Cheatsheet

```bash
gh pr status
gh pr list --author @me
gh pr view 123
gh pr diff 123
gh pr checkout 123
```

## Pitfalls

- Confirm base branch before opening
- Fork workflow: push to fork remote, open PR against upstream
- Never claim CI green without checks/logs
