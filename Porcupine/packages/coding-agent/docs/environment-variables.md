# Environment Variables


> **Naming:** prefer the `PORCUPINE_*` prefix. Legacy `PI_*` names are still accepted as fallbacks for compatibility with older scripts and the upstream Pi substrate.

Porcupine uses environment variables in three ways:

- Variables such as `PORCUPINE_OFFLINE` configure the Porcupine process.
- Porcupine sets `PORCUPINE_CODING_AGENT` so child processes can detect that they run inside Porcupine.
- Commands run by the LLM-callable bash tool receive `PI_*` variables describing the current session.

Provider API-key variables are documented separately in [Providers](providers.md#environment-variables-or-auth-file).

## Process Marker

The CLI and RPC entry points set `PORCUPINE_CODING_AGENT=true`. Child processes inherit it and can use it to detect that they run inside Porcupine. It is not session-specific and is not set automatically when Porcupine is embedded through the SDK.

## Bash Tool Session Environment

Commands run by the bash tool receive the current Porcupine session state:

| Variable | Description |
|----------|-------------|
| `PORCUPINE_SESSION_ID` (legacy `PI_SESSION_ID`) | Current session ID |
| `PORCUPINE_SESSION_FILE` (legacy `PI_SESSION_FILE`) | Absolute path to the current session JSONL file; unset for ephemeral sessions |
| `PORCUPINE_PROVIDER` (legacy `PI_PROVIDER`) | Currently selected model provider |
| `PORCUPINE_MODEL` (legacy `PI_MODEL`) | Currently selected model ID |
| `PORCUPINE_REASONING_LEVEL` (legacy `PI_REASONING_LEVEL`) | Current effective reasoning level: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max` |

The values are resolved when each command starts. Switching models or changing the reasoning level therefore affects the next bash command without restarting Porcupine. `PI_PROVIDER` and `PI_MODEL` identify the selected Porcupine model, not a different upstream model that a router may choose internally.

When asked which model or provider is running, inspect these variables instead of inferring the answer from the system prompt:

```bash
printf '%s/%s\n' "$PORCUPINE_PROVIDER" "$PORCUPINE_MODEL"
printf 'reasoning=%s session=%s\n' "$PORCUPINE_REASONING_LEVEL" "$PORCUPINE_SESSION_ID"
```

The session file can be inspected directly when the session is persistent:

```bash
if [ -n "$PORCUPINE_SESSION_FILE" ]; then
  tail -n 1 "$PORCUPINE_SESSION_FILE"
fi
```

These variables are injected into the LLM-callable bash tool. They are not injected into user-entered `!` or `!!` commands.

### Custom Bash Tools

Bash tools created with `createBashTool()` expose the session environment by default when registered with Porcupine. Injection happens before `spawnHook`, so a hook receives the variables in `ctx.env`:

```typescript
const bashTool = createBashTool(cwd, {
  spawnHook: (ctx) => ({
    ...ctx,
    env: { ...ctx.env, CI: "1" },
  }),
});
```

Disable session metadata independently of the spawn hook:

```typescript
const bashTool = createBashTool(cwd, {
  exposeSessionEnvironment: false,
  spawnHook: (ctx) => ctx,
});
```

When disabled, Porcupine removes inherited values for these variables so nested Porcupine processes do not expose stale parent-session metadata.

## Porcupine Process Configuration

These variables are read by Porcupine itself:

| Variable | Description |
|----------|-------------|
| `PORCUPINE_CODING_AGENT_DIR` | Override the config directory; default is `~/.porcupine/agent` |
| `PORCUPINE_CODING_AGENT_SESSION_DIR` | Override session storage; overridden by `--session-dir` |
| `PORCUPINE_PACKAGE_DIR` (legacy `PI_PACKAGE_DIR`) | Override the package directory, useful for Nix/Guix store paths |
| `PORCUPINE_OFFLINE` (legacy `PI_OFFLINE`) | Disable startup network operations, including update checks, package updates, and install/update telemetry |
| `PORCUPINE_SKIP_VERSION_CHECK` | Disable the latest-version request |
| `PORCUPINE_TELEMETRY` | Override install/update telemetry and provider attribution headers: `1`/`true`/`yes` or `0`/`false`/`no` |
| `PORCUPINE_CACHE_RETENTION` (legacy `PORCUPINE_CACHE_RETENTION` / `PI_CACHE_RETENTION`) | Set to `long` for extended provider prompt caching where supported |
| `PORCUPINE_SHARE_VIEWER_URL` (legacy `PI_SHARE_VIEWER_URL`) | Override the base URL used by `/share` |
| `PORCUPINE_HARDWARE_CURSOR` (legacy `PI_HARDWARE_CURSOR`) | Set to `1` to show the hardware cursor; see [Terminal setup](terminal-setup.md) |
| `PORCUPINE_TELEGRAM_TOKEN` | Bot token from @BotFather; when set, the interactive TUI starts the Telegram bridge (messages mirror into the shared session)
| `PORCUPINE_TELEGRAM_ALLOW` | Comma-separated chat ids allowed to talk to the bridge; empty allowlist means only `/start` responds (it reports the chat id to authorize) |
| `VISUAL`, `EDITOR` | External editor fallback when `externalEditor` is unset |
| `HTTP_PROXY`, `HTTPS_PROXY` | Proxy outbound HTTP requests |

Provider credentials such as `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and cloud-provider configuration are listed in [Providers](providers.md#environment-variables-or-auth-file).

## Agent-home `.env`

At CLI startup Porcupine loads `<agent home>/.env` (usually
`~/.porcupine/agent/.env`) with dotenv semantics: `KEY=VALUE` lines, `#`
comments, single/double quotes, and an optional `export` prefix. Variables
already set in the shell environment win over the file. This is the
recommended place for `PORCUPINE_TELEGRAM_TOKEN` and
`PORCUPINE_TELEGRAM_ALLOW` — keep the file `chmod 600` and never commit it.
