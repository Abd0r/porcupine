---
name: github-pr-conflicts
description: Resolve PR merge conflicts in isolated worktrees.
stack: vcs
tags: [github, conflicts, merge, rebase, pr]
---

# GitHub PR Conflict Resolution

## When to use

PR is CONFLICTING / dirty vs base. Not a substitute for code review.

## Prerequisites

`github-auth`. Push access to the PR head branch (or fork). Prefer an isolated worktree so a dirty main checkout stays untouched.

## 1. Inventory

```bash
git status --short --branch
git remote -v
gh pr view N --repo OWNER/REPO \
  --json headRefName,headRefOid,headRepository,headRepositoryOwner,baseRefName,mergeable,mergeStateStatus
```

Record the real `headRefName` and head repo — never invent the publish branch.

## 2. Isolated worktree

```bash
git fetch origin
BASE=$(gh pr view N --repo OWNER/REPO --json baseRefName -q .baseRefName)
HEAD_BRANCH=$(gh pr view N --repo OWNER/REPO --json headRefName -q .headRefName)
git fetch origin "$BASE" "pull/N/head:refs/remotes/origin/pr-N"
git worktree add ../repo-pr-N -b fix/pr-N-conflicts origin/pr-N
cd ../repo-pr-N
```

## 3. Merge or rebase base

```bash
git merge "origin/$BASE"
# or: git rebase "origin/$BASE"
# resolve with read/edit
git status
git add path/to/file
git merge --continue
# or: git rebase --continue
```

Conflict rules:
- Keep both sides when independent
- Prefer upstream API renames when the PR only changed call sites
- Do not drop the PR's intentional behavior just to make green

## 4. Verify then push

```bash
git push origin HEAD:"$HEAD_BRANCH"
# fork heads may need:
# git push git@github.com:FORK_OWNER/REPO.git HEAD:"$HEAD_BRANCH"
gh pr view N --repo OWNER/REPO --json mergeable,mergeStateStatus,headRefOid
gh pr checks N --repo OWNER/REPO
```

## 5. Cleanup

```bash
cd -
git worktree remove ../repo-pr-N
```

## Pitfalls

- Do not reset --hard / clean -fd the user's main worktree
- Push to the head fork branch, not only upstream
- Re-check mergeable after push — stale UI is common
