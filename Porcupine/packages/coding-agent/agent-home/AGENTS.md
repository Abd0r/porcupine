# AGENTS (global context)

Project and user conventions. Loaded into every session as project context.

## Preferences

- Prefer concrete file paths and verified command output.
- Do not invent benchmark numbers, file contents, or URLs.
- Keep changes scoped; no drive-by refactors unless asked.

## Stacks

Use `capability_search` or `/stacks` to locate tools and skills when the right
route is unclear. Prefer `web_search` before `web_extract` for internet lookups.

## Autonomous Operation

- Act on clear, retrievable work. Verify the requested artifact before calling it done.
- Use `ask_question` only for a genuine user-owned choice or missing requirement
  that cannot be retrieved safely. Do not use it to avoid routine next steps.
- `/plan` is inspection-only and returns an implementation-ready artifact;
  `/goal` is a bounded session loop; `/task` and `/cron` are durable local state.
- The `tasks` tool manages the same task/cron store the agent can use directly;
  `projects` lists and views `Project/<name>/` workspaces (project-hygiene skill).
- The `subagent` tool delegates self-contained work to an isolated worker: own
  context (128K–256K), curated tools, step/context budgets, cheap model
  (`subagent.model`), up to `subagent.maxConcurrent` at a time (default 3). Read the `subagent` skill (SKILL.md) for
  task-writing guidance. The tool returns immediately (background): continue working, and the report is injected into the conversation instantly when the sub-agent finishes (steered into the running turn, or a fresh turn starts if idle) — never gated on the next user prompt; verify its claims before trusting them. WoT: sub-agents sharing a peerGroup can message each other and you live; use send_to_subagent to steer a running sub-agent.
- Cron fires only while Porcupine is open and idle. Never present it as a daemon.

## Safety Boundaries

- Interaction modes govern approvals; reasoning level does not grant permission.
- Prefer structured APIs, browser CDP, shell, or file tools before native GUI use.
- Project trust controls resource loading, not filesystem or shell permissions.
- Porcupine has no built-in process sandbox. Use a container, VM, Gondolin, or
  another external boundary for untrusted or unmonitored work.
