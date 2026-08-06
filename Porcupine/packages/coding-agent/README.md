# Porcupine

A terminal coding agent that carries multi-step work end-to-end — with explicit
permission modes and a fail-closed safety gate. Built on [Pi](https://github.com/earendil-works/pi) (MIT).

```bash
porcupine "fix the failing tests and explain what was wrong"
```

## Install

From this monorepo:

```bash
cd packages/coding-agent
npm install --ignore-scripts
npm run build
npm link
```

Then run it in a project: `porcupine`. (CLI: `porcupine` · config: `~/.porcupine/agent/`.)

## What it is

An agent loop in your terminal. You state the goal; the harness handles the
rest: planning, delegation, verification, and recovery. It reads your repo,
runs commands, edits files, and reports back — under an interaction mode you
control (**Ask** confirms everything, **Normal** asks on flagged commands,
**Auto** runs with a fail-closed LLM gate that denies dangerous ones).

## Features

- **Sub-agents** — up to 3 parallel isolated workers (own context, curated
  tools, hard step budgets). Reports are injected into your context **instantly**
  (mid-turn or a fresh turn — never gated on your next prompt); **Escape**
  (empty editor) cancels running workers.
- **WoT (Web of Thoughts)** — sub-agents sharing a `peerGroup` message each
  other and you live, main-agent-gated; `send_to_subagent` steers a running
  worker. Multi-slot panel: `🧵 Sub-agents 2/3`.
- **MCP client** — connect MCP servers (stdio + Streamable HTTP); their tools,
  resources (`mcp_resources`), and prompts (`/mcpp:`) become first-class.
  Fail-closed gate, browser OAuth (DCR+PKCE), OS-keyring tokens. See
  [docs/mcp.md](docs/mcp.md).
- **Autonomous learning** — the agent improves its own skills and memory from
  real usage: evidence-graded proposals, snapshots + auto-rollback, a live
  activity feed (`/learning feed`), a refiner for weak skills, and a reviewed
  `tools.porcupine.json` registry for composed tools.
- **48 skills across all 17 stacks** — research-grounded, agentskills.io
  compliant, from `problem-solving` (the universal loop) to `secure-coding`,
  `shell-craft`, and `autonomous-delegation`.
- **Dynamic task graph** — footer tracker + chat graph animate on every
  multi-step turn: `/plan` gets a pre-routed capability graph; ordinary
  model-led turns build one live from actual tool calls.
- **Voice** — `/voice on`, push-to-talk with Space. Audio-capable models get
  native audio; text-only models use on-device Moonshine STT + Kokoro TTS.
- **Tasks & Cron** — durable task templates with attended schedules
  (`/task`, `/cron`; fires while the session is open and idle).
- **Projects** — `Project/<name>/` workspaces with `README.md` + `STATUS.md`.
- **Telegram bridge** — message the same session from your phone
  (`PORCUPINE_TELEGRAM_TOKEN` in `~/.porcupine/agent/.env`); confirmations and
  `ask_question` arrive as buttons.
- **Autonomy, bounded** — `/auto` enables autonomous operation; hardline
  destructive commands stay blocked in every mode. No daemon, no unattended
  execution: everything runs in the interactive session you can see.

## Docs

- [Full guide](docs/index.md) · [MCP](docs/mcp.md) · [Settings](docs/settings.md) ·
  [Skills](docs/skills.md) · [Security](docs/security.md) · [Extensions](docs/extensions.md) ·
  [Sessions](docs/sessions.md)

## License

MIT — see [LICENSE](../../LICENSE).
