<p align="center">
  <img src="porcupine-banner.png" alt="PORCUPINE" width="720" />
</p>

<p align="center">
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-%E2%89%A522.19.0-339933?logo=node.js&logoColor=white" alt="Node.js 22.19 or newer" /></a>
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5.9" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-EA9B34" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/Operation-local--first-1DE3C1" alt="Local-first operation" />
</p>

<p align="center">
  A <strong>safe autonomous agent</strong> that plans when needed, acts with explicit safety boundaries, and verifies its work.
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#what-porcupine-does">Capabilities</a> ·
  <a href="Porcupine/packages/coding-agent/docs/index.md">Documentation</a> ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

## Why Porcupine

Porcupine is a local terminal coding agent for working inside real repositories. It keeps the core narrow, then extends through tools, skills, prompt resources, themes, packages, and TypeScript extensions.

It is marketed and built as a <strong>safe autonomous agent</strong>: autonomous initiative for getting work done (Auto mode, self-recovery, verify-don't-ask) wrapped in explicit safety boundaries (fail-closed gates, hardline blocks, attended-only tasks and cron, confirmation-gated computer use). The autonomy is designed to get real work done — not to run away from the user.

It is built on top of Pi (MIT), but it is its own product: all packages are published under the [porcupineai npm org](https://www.npmjs.com/org/porcupineai) and the CLI binary is `porcupine`.

## Recommended model: DeepSeek V4 Flash via OpenCode Go

For a fast, cheap, capable default, use **DeepSeek V4 Flash** through the
**OpenCode Go** provider (1M context window, ~$0.14 / $0.28 per million
input/output tokens):

```bash
porcupine --provider opencode-go --model deepseek-v4-flash
```

Or inside a session: `/model` → select **opencode-go / deepseek-v4-flash**, then
`/reasoning high` for agentic coding. OpenCode Go also offers Kimi, Qwen,
GLM, MiniMax, and GPT/Grok-class models — see [Models](Porcupine/packages/coding-agent/docs/models.md).

## What Porcupine does

- **Guides people into the product.** Run `/guide` for a local onboarding path, focused topics, next commands, and the exact shipped documentation to read. It works before model login.
- **Plans without pretending.** `/plan <objective>` inspects the workspace and saves an implementation-ready Markdown plan without changing source code. `/goal <objective>` runs a bounded session goal loop.
- **Makes interaction policy visible.** `/modes` switches between Ask, Normal, and Auto. Reasoning depth is controlled separately from permission to act.
- **Speaks back.** `/voice` turns your mic into an input — press Space to talk. Audio-capable models (Gemini 3.x, Inkling) hear the audio natively; text-only models use on-device Moonshine STT + Kokoro TTS. Models auto-download on first use, nothing ships.
- **Delegates to isolated sub-agents.** The `subagent` tool spawns a focused worker with its own context window (128K–256K), curated tools, and hard step/context budgets — cheap model by default, up to 3 at a time (`subagent.maxConcurrent`), with a live multi-slot panel (`Sub-agents 2/3`) and instant report injection.
- **Works from your phone.** Set `PORCUPINE_TELEGRAM_TOKEN` (and `PORCUPINE_TELEGRAM_ALLOW` for your chat id) and the TUI starts a Telegram bridge: messages you send appear in the TUI, responses come back to both, and Ask-mode decisions arrive as Approve/Deny buttons or question options.
- **Works with real code.** Built-in file, shell, discovery, web, memory, session-search, and guarded computer-use capabilities are grouped under inspectable stacks. Run `/stacks [query]` to explore them.
- **Finds ongoing work quickly.** Run `/projects [query]` to list or search canonical `Project/<name>/` workspaces by name, README, or current status.
- **Keeps long work organized.** Sessions branch and compact. `/task` persists local task templates and run history. `/cron` schedules durable tasks only while an interactive Porcupine session is open and idle.
- **Learns cautiously.** Memory is for durable preferences and facts. Learning artifacts need evidence and never silently replace user-authored skills or extensions.
- **Does honest research.** A dedicated `sci` stack (literature review, reproducible experiments, data analysis, research writing, benchmark evals) plus a durable `literature` tool that records papers with DOI dedupe and evidence grades — citation trails survive across sessions.
- **Extends at the edges.** Add reusable skills, prompt templates, themes, packages, and TypeScript extensions without inflating the core tool surface.

## Install

### Option A — from source (recommended for v0.1)

```bash
git clone https://github.com/Abd0r/porcupineai.git
cd porcupine
cd Porcupine
npm install --ignore-scripts
npm run build

cd Porcupine/packages/coding-agent
npm link        # makes the local `porcupine` binary available on PATH
cd ../..
```

Without linking, run `node Porcupine/packages/coding-agent/dist/cli.js` from the repo root.

### Option B — global npm tarball

```bash
cd Porcupine/packages/coding-agent
npm pack
npm install -g ./porcupine-0.1.0.tgz
```

A first-class `npm i -g porcupine` release is coming — for v0.1, build from source or
pack the tarball.

### Requirements

- Node.js 22.19 or newer

## Run

Start Porcupine from the project you want to work on:

```bash
porcupine
```

Then, in the TUI:

```text
/guide start        # onboarding
/login              # configure a provider (or set an API key first)
porcupine --provider opencode-go --model deepseek-v4-flash   # or the recommended model
```

Describe the result you want in plain language — Porcupine reads, plans when
useful, acts within the active interaction mode, and verifies its work.

## First session

```text
/login
/guide start
Summarize this repository and tell me how to run its checks.
```

See [Quickstart](Porcupine/packages/coding-agent/docs/quickstart.md) for installation,
provider, and first-session details.

## Learn the command surface

Porcupine has a built-in guide rather than making newcomers hunt through command lists:

```text
/guide
/guide workflow
/guide modes
/guide planning
/guide research
/guide computer
/guide learning
/guide sessions
/guide customize
```

Useful commands:

| Command | Use it for |
| --- | --- |
| `/guide [topic]` | Learn a workflow and the documentation behind it. |
| `/modes` | Choose Ask, Normal, or Auto interaction policy. |
| `/plan <objective>` | Produce a non-executing implementation plan. |
| `/goal <objective>` | Start a bounded durable goal loop for the current session. |
| `/task` / `/cron` | Manage durable local tasks and attended-only schedules. |
| `/stacks [query]` | Inspect available tools and skills by capability area. |
| `/projects [query]` | List or search `Project/<name>/` workspaces. |
| `/settings` | Configure interactive preferences. |
| `/resume` / `/tree` | Return to or branch prior work. |

## Safety model

Porcupine runs with the permissions of the account that launches it. Project trust controls whether project-local resources load; it is not a sandbox. Built-in computer input remains confirmation-gated, and Auto mode uses a fail-closed shell safety gate for flagged commands.

For untrusted code or unattended work, use a real isolation boundary such as a container, VM, micro-VM, or remote sandbox. Read [Security](Porcupine/packages/coding-agent/docs/security.md) and [Containerization](Porcupine/packages/coding-agent/docs/containerization.md) before treating a workspace as isolated.

## Documentation

- [Quickstart](Porcupine/packages/coding-agent/docs/quickstart.md)
- [Using Porcupine](Porcupine/packages/coding-agent/docs/usage.md)
- [Providers](Porcupine/packages/coding-agent/docs/providers.md)
- [Sessions](Porcupine/packages/coding-agent/docs/sessions.md)
- [Skills](Porcupine/packages/coding-agent/docs/skills.md)
- [Extensions](Porcupine/packages/coding-agent/docs/extensions.md)
- [Settings](Porcupine/packages/coding-agent/docs/settings.md)
- [Full documentation index](Porcupine/packages/coding-agent/docs/index.md)

## Development

```bash
npm install --ignore-scripts
npm run build
npm run check
./test.sh
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md) before opening a change.

## License

[MIT](LICENSE). The existing copyright notice is preserved.
