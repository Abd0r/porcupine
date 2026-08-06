---
name: github-auth
description: Set up GitHub auth via gh CLI, HTTPS token, or SSH.
stack: vcs
tags: [github, auth, gh, git, ssh, token]
---

# GitHub Auth

## When to use

Any GitHub work before PRs, issues, authenticated clone, or API calls.

## Tools

- `bash` for `gh`, `git`, `ssh`, `curl`
- Never print full tokens. Prefer existence checks.

## Detection (run first)

```bash
git --version
command -v gh >/dev/null && gh --version || echo "gh not installed"
gh auth status 2>/dev/null || echo "gh not authenticated"
test -n "${GH_TOKEN:-${GITHUB_TOKEN:-}}" && echo "token env set" || echo "no GH_TOKEN/GITHUB_TOKEN"
```

Decision:
1. `gh auth status` OK → use `gh` for everything
2. `gh` installed, not authed → Method A
3. no `gh` → Method B (git + token) or Method C (SSH)

## Method A — gh CLI (preferred)

```bash
# Interactive device login (user completes in browser)
gh auth login -h github.com -p https -w

# Or token from env (do not echo the token back into chat)
# printf '%s\n' "$GH_TOKEN" | gh auth login --with-token

gh auth status
gh api user --jq .login
```

Useful scopes: `repo`, `read:org`, `workflow` (Actions), `gist` optional.

## Method B — git HTTPS + PAT

User creates classic PAT at https://github.com/settings/tokens  
Scopes: `repo` (+ `workflow` if Actions, `read:org` for org repos).

```bash
git config --global credential.helper store
# First remote op prompts once: username = GitHub login, password = PAT
git ls-remote https://github.com/<user>/<repo>.git
```

Env fallback for API without gh:

```bash
: "${GITHUB_TOKEN:=${GH_TOKEN:-}}"
# Optional one-key load from Porcupine home (never dump the whole file):
# set -a; source <(grep -E '^(GH_TOKEN|GITHUB_TOKEN)=' ~/.porcupine/agent/.env 2>/dev/null); set +a
curl -sS -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/user
```

## Method C — SSH

```bash
test -f ~/.ssh/id_ed25519.pub || ssh-keygen -t ed25519 -C "porcupine" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
# User adds key at https://github.com/settings/keys
ssh -T git@github.com
git remote set-url origin git@github.com:OWNER/REPO.git
```

## Porcupine notes

- Shell tool is `bash` (not Hermes `terminal`)
- Agent home: `~/.porcupine/agent/` (not `~/.hermes`)
- Do not write tokens into skills, PROMPT.md, or chat logs

## Verify

```bash
gh auth status 2>/dev/null || true
git ls-remote origin HEAD 2>/dev/null | head -1
```
