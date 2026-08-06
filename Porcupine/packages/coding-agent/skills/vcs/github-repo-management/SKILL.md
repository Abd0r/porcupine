---
name: github-repo-management
description: Clone, fork, create repos; remotes, releases, settings.
stack: vcs
tags: [github, clone, fork, release, remote, repo]
---

# GitHub Repo Management

## When to use

Clone/fork/create repos, fix remotes, cut releases, inspect repo metadata.

## Prerequisites

Load `github-auth`. Prefer `gh`; fall back to `git` + token curl.

## Setup helpers

```bash
if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then AUTH=gh; else AUTH=git; fi
REMOTE_URL=$(git remote get-url origin 2>/dev/null || true)
OWNER_REPO=$(echo "$REMOTE_URL" | sed -E 's|.*github\.com[:/]||; s|\.git$||')
```

## Clone

```bash
git clone https://github.com/OWNER/REPO.git
git clone --depth 1 https://github.com/OWNER/REPO.git
git clone --branch main https://github.com/OWNER/REPO.git
gh repo clone OWNER/REPO
```

## Fork

```bash
gh repo fork OWNER/REPO --clone=true
git remote -v
# origin → your fork; add upstream if missing
git remote add upstream https://github.com/OWNER/REPO.git 2>/dev/null || true
```

## Create

```bash
gh repo create NAME --private --source=. --remote=origin --push
gh repo create ORG/NAME --public --description "short description"
```

## Remotes and default branch

```bash
git remote -v
git remote set-url origin https://github.com/YOU/REPO.git
gh repo view --json nameWithOwner,defaultBranchRef,isPrivate,url
git fetch origin
git branch -vv
```

## Releases

```bash
gh release list --limit 10
gh release view latest
gh release create v1.2.3 --title "v1.2.3" --generate-notes
gh release upload v1.2.3 ./dist/artifact.tgz
```

## Browse without full clone

```bash
gh api repos/OWNER/REPO/contents/PATH --jq '.[].name'
gh api "repos/OWNER/REPO/git/trees/BRANCH?recursive=1" --jq '.tree[].path' | head -100
gh api repos/OWNER/REPO/readme --jq .content | base64 -d | head -80
```

## Pitfalls

- Shallow clones lack history for some bisects
- Fork PRs need push access to the head fork, not only upstream
- Never force-push main/master without explicit user ask
