---
name: github-issues
description: List, create, triage, label, close GitHub issues with gh.
stack: vcs
tags: [github, issues, triage, labels, bugs]
---

# GitHub Issues

Mechanical issue CRUD. For "does this PR solve issue N?" use `github-research`.

## Prerequisites

`github-auth`. Inside a GitHub repo or pass `--repo OWNER/REPO`.

## List and view

```bash
gh issue list
gh issue list --state open --label bug
gh issue list --assignee @me
gh issue list --search "auth timeout" --state all
gh issue view 42
gh issue view 42 --json title,body,state,labels,assignees,comments
```

## Create

```bash
gh issue create --title "Bug: short title" --body "## Summary
...

## Repro
1.
2.

## Expected
..."
```

Optional flags: `--label bug` `--assignee @me`

## Triage

```bash
gh issue edit 42 --add-label "bug,priority/high"
gh issue edit 42 --remove-label "needs-triage"
gh issue edit 42 --add-assignee @me
gh issue comment 42 --body "Root cause looks like ..."
gh issue close 42 --reason completed
gh issue reopen 42
```

## Search

```bash
gh issue list --repo OWNER/REPO --search "is:open label:bug sort:updated-desc" --limit 30
```

## curl fallback

```bash
curl -sS -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$OWNER/$REPO/issues?state=open&per_page=20"
# /issues also returns PRs — skip objects that have a pull_request key
```

## Pitfalls

- Do not close as fixed without a linked PR or verified fix
- Prefer full issue bodies via gh, not web-search snippets
