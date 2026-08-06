---
name: github-research
description: Verify which issues a PR solves via gh, not web search.
stack: vcs
tags: [github, issues, verify, research, pr]
---

# GitHub Research (verify matches)

## When to use

"Does this PR fix issue X?", related issues, search issues in a repo.

Mechanical list/create → `github-issues`. This skill is **mechanism match**, not keywords.

## Hard rule

Never use `web_search` or a browser to verify GitHub issues.  
Use `gh` (or the GitHub API). Web snippets produce false "fixed" claims.

## Procedure

### 1. Search with gh

```bash
gh issue list --repo OWNER/REPO --search "keywords" --limit 20 --state all
gh search issues "repo:OWNER/REPO keywords" --limit 20
```

### 2. Fetch full bodies

```bash
gh issue view N --repo OWNER/REPO --json number,title,body,state,labels
```

Do not judge from the title alone.

### 3. Mechanism cross-check (write it out)

For each candidate:
- What root cause / missing behavior does the issue report? (quote body)
- What does the PR do mechanically? (code path, not title)
- Does that mechanism address that root cause?
- Naming collision? Same word, different feature?

Only claim "solves #N" if the mechanism check passes. Else: "related, not verified".

### 4. PR linkage

```bash
gh pr view N --repo OWNER/REPO --json title,body,closingIssuesReferences,files
gh pr diff N --repo OWNER/REPO | head -200
```

## Output style

- Verified fixes: `#N — reason`
- Related only: separate list
- Non-matches: omit or one-line discard

## Pitfalls

- Shared config field names are not the same bug
- Closed issues can still be the right historical match — read state
