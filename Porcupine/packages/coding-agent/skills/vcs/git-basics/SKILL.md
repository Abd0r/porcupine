---
name: git-basics
description: Safe local git plus pointer to GitHub skill stack.
stack: vcs
tags: [git, github, basics]
---

# Git Basics (+ GitHub stack map)

## Local git

```bash
git status -sb
git branch --show-current
git diff
git log -5 --oneline
git remote -v
```

Rules:
- Stage intentional paths (not blind `git add .`)
- No force-push to main/master without explicit ask
- No secrets in commits

## GitHub skill stack (load the matching one)

| Task | Skill |
|------|--------|
| Auth / gh login | `github-auth` |
| Clone fork create release | `github-repo-management` |
| Issues CRUD | `github-issues` |
| Branch → PR → CI → merge | `github-pr-workflow` |
| Review diff / comments | `github-code-review` |
| Does PR solve issue N? | `github-research` |
| Merge conflicts on PRs | `github-pr-conflicts` |
| Explore unfamiliar repo | `github-explore` |
| Profile a user | `github-profile` |
| LOC / languages | `codebase-inspection` |

Paths: `skills/vcs/<name>/SKILL.md` under the agent or package skills tree.  
Tools: `bash`, `read`, `edit`, `write` (Porcupine names — not Hermes `terminal` / `read_file`).
