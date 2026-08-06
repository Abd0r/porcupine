---
name: github-code-review
description: Review PR diffs and leave gh review comments.
stack: vcs
tags: [github, review, diff, quality, pr]
---

# GitHub Code Review

## When to use

Local pre-push review or reviewing an open PR. Not for merge-conflict repair.

## Local review (pre-push)

```bash
git fetch origin
git diff main...HEAD --stat
git log main..HEAD --oneline
git diff main...HEAD
```

Procedure:
1. Stat + commits first
2. Per file: `git diff main...HEAD -- path` then `read` full file for context
3. Check correctness, security, edges, tests, naming, dead code
4. Prefer invariants over snapshot nits

## Remote PR review

```bash
gh pr view 123
gh pr diff 123
gh pr diff 123 --name-only
gh api repos/OWNER/REPO/pulls/123/files --jq '.[].filename'
```

## Submit review

```bash
gh pr review 123 --comment -b "Looks good overall. One note: ..."
gh pr review 123 --request-changes -b "Blocking: ..."
# approve only if the user wants you to approve
gh pr review 123 --approve -b "LGTM — verified ..."
```

Inline comment example:

```bash
COMMIT=$(gh pr view 123 --json headRefOid -q .headRefOid)
gh api repos/OWNER/REPO/pulls/123/comments \
  -f body="nit: ..." -f path="src/a.ts" -F line=42 -f side=RIGHT -f commit_id="$COMMIT"
```

## Checklist

- Change matches the PR claim?
- Failure modes: null, empty, races
- Secrets / injection / path traversal
- Tests cover the bug class?
- Backward compatibility
- No drive-by refactors hiding the fix

## Pitfalls

- Do not approve untested own changes
- Title keywords are not proof of correctness
- Skip generated noise; focus on source
