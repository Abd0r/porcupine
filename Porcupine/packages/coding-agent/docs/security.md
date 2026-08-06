# Security

Porcupine is a local coding agent. It runs with the permissions of the user account that starts it, and it treats files writable by that user as inside the same local trust boundary.

## Project Trust

Project trust controls whether porcupine loads project-local settings, resources, packages, and extensions. It is not a sandbox and it does not restrict what the model can ask tools to do after you start working in a directory.

Porcupine considers a project to have resources that require trust when it finds any of these from the current working directory:

- `.porcupine/settings.json`
- `.porcupine/extensions`, `.porcupine/skills`, `.pi/prompts`, or `.pi/themes`
- `.pi/SYSTEM.md` or `.pi/APPEND_SYSTEM.md`
- project `.agents/skills` in the current directory or an ancestor directory

A bare `.pi` directory does not count as a project resource that requires trust.

When an interactive session starts in a project with resources that require trust and no saved decision for the current directory or a parent directory, porcupine follows `defaultProjectTrust` from global settings. The default value is `"ask"`, which asks whether to trust the project when UI is available. Saved decisions are stored by canonical directory in `~/.porcupine/agent/trust.json`, and the closest saved decision on the current or parent path applies before the global default.

Trusting a project allows porcupine to load project resources that require trust, including:

- `.porcupine/settings.json`
- `.pi` resources such as extensions, skills, prompt templates, themes, and system prompt files
- missing project packages configured through project settings
- project-local extensions and project package-managed extensions

Declining trust skips protected resources. `AGENTS.md` and `CLAUDE.md` context files are loaded regardless of project trust unless context loading is disabled. Before trust is resolved, porcupine only loads context files, user/global extensions, and CLI `-e` extensions. User/global and CLI extensions can handle the `project_trust` event; the first extension that returns a yes/no decision owns the decision.

Non-interactive modes (`-p`, `--mode json`, and `--mode rpc`) do not show a trust prompt. Without an applicable saved trust decision, `defaultProjectTrust: "ask"` and `"never"` ignore such resources, while `"always"` trusts them. Use `--approve`/`-a` or `--no-approve`/`-na` to override project trust for one run.

## No Built-in Sandbox

Porcupine does not include a built-in sandbox. Built-in tools can read files, write files, edit files, and run shell commands with the permissions of the porcupine process. Extensions are TypeScript modules that run with the same permissions. Package installs, shell commands, language servers, test commands, and other developer tools behave as ordinary local processes.

This is intentional. Porcupine is designed to operate on local source trees, invoke project toolchains, and integrate with the user's existing development environment. A partial in-process sandbox would be easy to misunderstand as a security boundary while still depending on the host shell, filesystem, package managers, credentials, and extension code. Real isolation needs to come from the operating system or a virtualization/container boundary.

Project trust is only an input-loading guard. It prevents a repository from silently changing porcupine's settings or extensions before you approve it. It does not make untrusted code, untrusted prompts, or untrusted model output safe. Prompt injection from repository files, comments, documentation, context files, or build output is expected local-agent risk and cannot be reliably prevented by porcupine.

## Interaction Modes and the Fail-Closed Gate

Interaction modes choose how tool actions are approved, independent of reasoning settings: **Ask** confirms every bash command and file mutation, **Normal** confirms flagged operations, and **Auto** permits safe operations while routing flagged bash through a fail-closed LLM safety gate. In every mode, hardline destructive actions (`rm -rf /`, force-push, credential deletion, etc.) remain blocked. Auto mode is autonomy, not a permission upgrade: it never makes destructive actions unrestricted, and it runs only while an interactive session is open and attended.

## MCP (Model Context Protocol) Servers

MCP servers are external tools — treat them as untrusted. Porcupine's MCP client is **fail-closed**: a tool runs only when allowlisted or explicitly approved, hard-line destructive calls are denied in every mode, approvals are bound to a server content-hash (not its name — CVE-2025-54136), and project `mcp.json` servers do not auto-start without project trust. See [MCP](mcp.md) for the full security model.

## Telegram Remote Access

Porcupine can be controlled from a phone via the Telegram bridge (`PORCUPINE_TELEGRAM_TOKEN`). Treat this as remote access to a local agent session:

- **Allowlist-gated**: only chat ids listed in `PORCUPINE_TELEGRAM_ALLOW` can talk to the agent; everything else is ignored.
- **Attended-only**: the bridge runs inside the interactive TUI session. It does not start headless and is never a daemon.
- **Same approval surface**: Ask-mode confirmations (bash commands, file mutations) are forwarded to Telegram as Approve/Deny buttons AND shown in the TUI; the first response wins. Unauthorized chats never see these prompts.
- **Token is a credential**: keep `PORCUPINE_TELEGRAM_TOKEN` in `~/.porcupine/agent/.env` (chmod 600) or your environment; never commit it.

See [usage.md](usage.md) for the full bridge feature list.

## Running Untrusted or Unmonitored Work

For untrusted repositories, generated code you do not intend to monitor closely, or unattended automation, run porcupine in a contained environment. Use a container, VM, micro-VM, remote sandbox, or policy-controlled sandbox with only the files and credentials required for the task.

Common patterns are documented in [Containerization](containerization.md):

- run the the whole `porcupine` process inside a container/sandbox
- run host porcupine while routing built-in tool execution into a Gondolin micro-VM
- mount only the workspace paths the agent should access
- avoid mounting host `~/.porcupine/agent` unless the container should access host sessions, settings, and credentials
- pass the minimum required API keys or use short-lived credentials
- restrict network access when the task does not need it
- review diffs and outputs before copying results back to trusted systems

If you bind-mount a host workspace read/write, writes from inside the container or VM can still modify host files. Use read-only mounts or copy files into and out of the sandbox when you need stronger protection from unintended writes.

## Reporting Security Issues

To report a security issue, follow the repository [Security Policy](https://github.com/Abd0r/porcupine/blob/main/Porcupine/SECURITY.md). Do not open a public issue for security-sensitive reports.

Expected local-agent behavior, lack of a built-in sandbox, prompt injection from untrusted content, and behavior of user-installed extensions or skills are generally outside the security boundary unless the report demonstrates a real privilege-boundary bypass or shows how porcupine grants access that the local user did not already have.
