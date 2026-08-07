# AGENTS (global context)

Project and user conventions. Loaded into every session as project context.

## Preferences

- Prefer concrete file paths and verified command output.
- Do not invent benchmark numbers, file contents, or URLs.
- Keep changes scoped; no drive-by refactors unless asked.

## Stacks

Use `capability_search` or `/stacks` to locate tools and skills when the right
route is unclear. Prefer `web_search` before `web_extract` for internet lookups.

## Environment & product surface

- The product ships: `/sandbox` (Gondolin micro-VM isolation for built-in
  tools), remote bridges for Telegram / Discord / iMessage (shared-session
  messaging, allowlist-gated, attended-only, plus owner `!status` / `!tasks` /
  `!run <taskId>` / `!help` control commands), `--headless` CI task mode,
  `porcupine serve` (headless HTTP API: sessions, async prompts, SSE events,
  programmatic approval), the stacks capability tree, and sub-agents with the
  whole tool stack minus agent-level tools (step budget per `subagent.maxSteps`
  setting, default 120). Full behavior details live in PROMPT.md and `docs/`
  (usage, server, subagents, stacks, security, containerization).
- Session UI: full-screen markdown viewer (agent presents plans/reports via the
  `show_markdown` tool; `/view <path>` opens a file), `/usage` + `/cost`
  observability, `/memory` + `/init` (project AGENTS.md generator), and task
  chaining (`next`/`nextOnFail`) + event triggers (`file` content-change,
  `script` exit-code) with completion notifications to chat bridges
  (`notifyOnTaskCompletion`, default on).
- Session state lives under `~/.porcupine/agent/` (settings, sessions,
  memory, learning). Repo root: `~/Porcupine/Porcupine` (monorepo;
  `packages/coding-agent` is the product package).

## Stopping / interrupting

- The MAIN AGENT can stop sub-agents directly with the `stop_subagent` tool
  (one by id, or all) when a worker is stuck, off-track, or no longer needed —
  a stopped run reports `⏹ cancelled` instead of completing.
- The user can abort any turn with `Escape` (`app.interrupt`; the strip shows
  "(esc to interrupt)") and cancel ALL running sub-agents with `Escape` on an
  empty editor (`⏹ Sub-agents cancelled`). Double-`Escape` on an empty editor
  opens the session tree (`doubleEscapeAction`, default `tree`). `/quit` exits
  the session.
- The agent never kills its own process; it stops work by ending the turn or
  stopping its sub-agents. Run abort always stops a runaway sub-agent at its
  budget.

## Autonomous Operation

- Act on clear, retrievable work. Verify the requested artifact before calling it done.
- Use `ask_question` only for a genuine user-owned choice or missing requirement
  that cannot be retrieved safely. Do not use it to avoid routine next steps.
- `/plan` is inspection-only and returns an implementation-ready artifact;
  `/goal` is a bounded session loop; `/task` and `/cron` are durable local state.
- The `tasks` tool manages the same task/cron store the agent can use directly;
  `projects` lists and views `Project/<name>/` workspaces (project-hygiene skill).
- The `subagent` tool delegates self-contained work to an isolated worker: own
  context (128K–256K), the WHOLE tool stack minus agent-level tools (no
  sub-spawning, no GUI, no user questions — but `capability_search`, so the
  full skill catalog is reachable), 120-step budget, cheap model
  (`subagent.model`), up to `subagent.maxConcurrent` at a time (default 3). Read the `subagent` skill (SKILL.md) for
  task-writing guidance. The tool returns immediately (background): continue working, and the report is injected into the conversation instantly when the sub-agent finishes (steered into the running turn, or a fresh turn starts if idle) — never gated on the next user prompt; verify its claims before trusting them. WoT: sub-agents sharing a peerGroup can message each other and you live; use send_to_subagent to steer a running sub-agent.
- Cron fires only while Porcupine is open and idle. Never present it as a daemon.

## Safety Boundaries

- Interaction modes govern approvals; reasoning level does not grant permission.
- Prefer structured APIs, browser CDP, shell, or file tools before native GUI use.
- Project trust controls resource loading, not filesystem or shell permissions.
- Porcupine has no built-in process sandbox. Use a container, VM, Gondolin, or
  another external boundary for untrusted or unmonitored work.
