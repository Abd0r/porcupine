# Porcupine Launch Film — Redaction Checklist

Run this on the RAW capture and every render before anything ships.

## Secrets & credentials
- [ ] No API keys visible (any provider) — env vars masked
- [ ] No npm tokens (`npm_...`), GitHub tokens, Telegram tokens
- [ ] No `~/.npmrc` / `auth.json` content visible
- [ ] No OAuth callback / port numbers tied to credential flows

## Personal & account info
- [ ] No `/Users/<real-username>` paths — the film must show no real home path
- [ ] No full name, personal email, phone, or personal identifiers
- [ ] No Telegram owner chat id or bridge tokens
- [ ] No session/account IDs from providers

## Repo & internal surfaces
- [ ] No `bug-reports/`, `research/`, `benchmarks/` paths visible
- [ ] No `.pi/`, `Project/`, `tui-plan.md`, `.env` visible
- [ ] No sourcemap/absolute build paths leaking the user's home

## Product accuracy (content rules)
- [ ] No benchmark numbers anywhere (Terminal-Bench/SWE/MCP-Atlas/ARC) — per brief, none
- [ ] No `/plan` shown transitioning into implementation
- [ ] No user↔sub-agent chat (user never addresses a worker directly)
- [ ] No capability-search shown as installing/loading tools
- [ ] No sandbox/isolation claim — the film never implies full system isolation
- [ ] Learning scene only if the run produced a genuine evidence-backed event
- [ ] Footer shows the real mode + model; Auto is never shown as disabling safety

## Technical
- [ ] Terminal text readable at 1080p (test every shot at final render size)
- [ ] No notifications, no unrelated apps in frame
- [ ] Full unedited master preserved alongside the cut

## Final
- [ ] Version text = v0.1.41 (not 0.1.0) · skills = 48 · stacks = 17
- [ ] Exact Porcupine commit + model + settings + prompts + demo-repo commit recorded
