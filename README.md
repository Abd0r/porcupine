<p align="center">
  <img src="https://raw.githubusercontent.com/Abd0r/porcupineai/main/Porcupine/packages/coding-agent/assets/porcupine-banner.png" alt="Porcupine" width="720" />
</p>

<p align="center">
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-%E2%89%A522.19.0-339933?logo=node.js&logoColor=white" alt="Node.js 22.19+" /></a>
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5.9" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-EA9B34" alt="MIT" /></a>
  <a href="https://www.npmjs.com/package/@porcupineai/porcupineai"><img src="https://img.shields.io/npm/v/@porcupineai/porcupineai" alt="npm version" /></a>
</p>

A terminal coding agent. You describe the goal; it reads your repo, runs commands, edits files, and verifies the result — inside a permission mode you control.

Built on top of [Pi](https://github.com/earendil-works/pi) (MIT), as its own product.

---

## Install

```bash
npm install -g @porcupineai/porcupineai
```

Requires **Node.js 22.19+**.

Or build from source:

```bash
git clone https://github.com/Abd0r/porcupineai.git
cd porcupineai/Porcupine
npm install --ignore-scripts
npm run build
npm link
```

## Quick start

```bash
porcupine
```

Then, in the TUI:

```text
/login                        # connect a provider (or set an API key)
/guide                        # interactive onboarding
```

Try: *"Summarize this repository and tell me how to run its checks."*

## Interaction modes

| Mode | Behavior |
| --- | --- |
| **Ask** | Confirms every command and file change |
| **Normal** | Runs safe operations; asks on flagged ones |
| **Auto** | Runs autonomously with a fail-closed safety gate for dangerous commands |

Reasoning depth is separate from permission: `/reasoning` and `/adaptive` tune thinking effort without changing what the agent is allowed to do.

## What's inside

- **Sub-agents** — up to 3 parallel workers (own context, curated tools, step budgets). Reports are injected instantly; Escape cancels. `🧵 Sub-agents 2/3` panel.
- **WoT (Web of Thoughts)** — sub-agents sharing a `peerGroup` message each other and you live; `send_to_subagent` steers any running worker.
- **MCP client** — connect MCP servers (stdio + Streamable HTTP); tools, resources (`mcp_resources`) and prompts (`/mcpp:`) become first-class. Fail-closed security gate, browser OAuth, OS-keyring tokens.
- **Autonomous learning** — the agent improves its own skills and memory from real use: evidence-graded proposals, snapshots + auto-rollback, a live feed (`/learning feed`), and a refiner for weak skills.
- **48 skills across 17 stacks** — from `problem-solving` to `secure-coding`, `root-cause-analysis`, and `autonomous-delegation`.
- **Dynamic task graph** — the footer tracker animates on every multi-step turn.
- **Voice** — `/voice on`, push-to-talk with Space.
- **Tasks & Cron** — durable task templates with attended schedules (`/task`, `/cron`).
- **Projects** — `Project/<name>/` workspaces with README + STATUS.
- **Telegram bridge** — message the same session from your phone.

## Safety

Porcupine runs with the permissions of the account that launches it. Project trust controls which project-local resources load — it is not a sandbox. For untrusted or unattended work, use a real isolation boundary (container, VM, micro-VM).

Read [Security](Porcupine/packages/coding-agent/docs/security.md) and [Containerization](Porcupine/packages/coding-agent/docs/containerization.md).

## Documentation

- [Full index](Porcupine/packages/coding-agent/docs/index.md)
- [Quickstart](Porcupine/packages/coding-agent/docs/quickstart.md) · [Usage](Porcupine/packages/coding-agent/docs/usage.md) · [Settings](Porcupine/packages/coding-agent/docs/settings.md)
- [MCP](Porcupine/packages/coding-agent/docs/mcp.md) · [Skills](Porcupine/packages/coding-agent/docs/skills.md) · [Extensions](Porcupine/packages/coding-agent/docs/extensions.md)
- [Sessions](Porcupine/packages/coding-agent/docs/sessions.md)

## License

[MIT](LICENSE).

---

<p align="center">
  <a href="https://github.com/Abd0r/porcupineai">GitHub</a> ·
  <a href="https://www.npmjs.com/package/@porcupineai/porcupineai">npm</a> ·
  <a href="LICENSE">MIT License</a>
</p>
