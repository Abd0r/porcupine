---
name: github-profile
description: Profile a GitHub user from public repos and README.
stack: vcs
tags: [github, profile, user, research]
---

# GitHub Profile Research

## When to use

"Who is this GitHub user?", public identity/project overview. Public data only.

## Procedure

```bash
gh api users/LOGIN --jq '{login,name,bio,location,blog,public_repos,followers,created_at}'
gh api repos/LOGIN/LOGIN/readme --jq .content | base64 -d | head -150
gh repo list LOGIN --limit 40 --json name,description,updatedAt,isPrivate,primaryLanguage,stargazerCount
```

1. Identity fields (login, bio, links)
2. Profile README (self-description)
3. Group repos by theme (do not invent private work)
4. Separate: self-description vs repo evidence vs verified results
5. Preserve their caveats

## Pitfalls

- No web-search snippets for identity
- Public bio is not a full private story
- Do not paste sensitive contact info unless needed
