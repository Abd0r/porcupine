---
name: github-explore
description: Explore a GitHub repo structure, README, and layout.
stack: vcs
tags: [github, explore, readme, structure, research]
---

# GitHub Repository Exploration

## When to use

Understand an unfamiliar repo before changing it, or research a project from GitHub.

## Prefer gh/git over browser

```bash
gh repo view OWNER/REPO
gh repo view OWNER/REPO --json description,defaultBranchRef,url,stargazerCount,languages
gh api repos/OWNER/REPO/readme --jq .content | base64 -d | head -120
gh api "repos/OWNER/REPO/git/trees/HEAD?recursive=1" --jq '.tree[].path' | head -200
gh api repos/OWNER/REPO/contents/ --jq '.[].name'
```

Clone when you need real search/edit:

```bash
gh repo clone OWNER/REPO /tmp/OWNER-REPO
cd /tmp/OWNER-REPO
```

Then use `read` / `bash` and project docs (`README`, `AGENTS.md`, `docs/`).

## Structured notes template

```markdown
## Purpose
## Layout (key dirs)
## Build / test commands
## Entry points
## Risks / unknowns
```

## Pitfalls

- raw.githubusercontent.com can 404 on renamed defaults — use `gh api` + default branch
- Do not treat README marketing as verified benchmarks
