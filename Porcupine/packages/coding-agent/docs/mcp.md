# MCP (Model Context Protocol) Support

Porcupine is an MCP **client**: it connects to MCP servers (local stdio processes
or remote HTTP endpoints) and exposes their **tools**, **resources**, and
**prompts** as first-class agent capabilities. Everything is fail-closed by
default — an MCP tool does nothing until you allow it.

## Config — `mcp.json`

Servers are declared in two layered files (project overrides global):

- **Global:** `~/.porcupine/agent/mcp.json`
- **Project:** `<cwd>/.porcupine/mcp.json`

```jsonc
{
  "mcpServers": {
    "filesystem": {
      "type": "stdio",                 // required: "stdio" (v1) | "http" / "streamableHttp" (v2)
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
      "env": { "FOO": "${FOO:-default}" }, // ${VAR} expansion
      "cwd": ".",
      "enabled": true,
      "allow": ["filesystem_read_file", "filesystem_list_directory"], // tool allowlist
      "timeoutMs": 60000
    },
    "remote": {
      "type": "http",
      "url": "https://example.com/mcp",
      "headers": { "Authorization": "Bearer ${TOKEN}" },
      "oauth": { "clientId": "…", "clientSecret": "…" }, // or { "clientId": "…", "privateKey": "…", "algorithm": "RS256" } / true for browser flow
      "enabled": true,
      "allow": []
    }
  }
}
```

- **`type` is required** — an entry without it is a config error (avoids the
  Claude-vs-Cline ambiguity).
- **`allow`**: per-server allowlist of raw MCP tool names. **Empty/missing =
  deny everything** (fail-closed). Without an allowlist entry, every call
  requires interactive confirmation.
- **`enabled: false`** disables a server (project config can disable a global
  one).

## Slash commands

| Command | What it does |
|---|---|
| `/mcp` / `/mcp status` | Per-server health (connected / auth_required / failed / disabled), transport, tool/resource/prompt counts, oauth state |
| `/mcp reload` | Re-read config, diff start/stop changed servers, re-hash approved server configs (rug-pull detection), refresh tools |
| `/mcp auth <server>` | Clear cached tokens and run the interactive **browser OAuth** flow (DCR + PKCE) for a remote server |
| `/mcpp:<server>:<prompt>` | Run an MCP **prompt** as a slash command (e.g. `/mcpp:fs:summarize`) |

## MCP tools, resources, prompts

- **Tools** register as normal agent tools, namespaced `server_toolname`
  (e.g. `filesystem_read_file`) so no collisions between servers. They flow
  through the same tool pipeline as built-ins (active-tool filtering, extension
  event hooks).
- **Resources** are loaded **on demand** via the `mcp_resources` tool:
  `action=list` shows what's available across servers, `action=read` loads one
  into context as plain text. Nothing is auto-injected (no context bloat).
- **Prompts** become slash commands: `/mcpp:<server>:<prompt>`.

## Security model (fail-closed)

MCP tools are arbitrary executables over potentially untrusted data — so they
are gated like `bash`:

1. **Hard-line destructive calls are denied in ALL modes** (destructive SQL,
   `rm`/`format` patterns, credential reads, exfiltration patterns).
2. **No interactive confirm callback → denied** (headless fails closed).
3. **Rug-pull detection**: approval is bound to the server's **content hash**
   (command+args+config). If the server changes after approval, it must be
   re-approved — approval is never bound to a name alone (CVE-2025-54136).
4. **Allowlist-first**: a tool runs directly only if it's on the server's
   `allow` list (in Normal/Auto). Everything else asks.
5. **Ask mode** confirms every MCP call with full args. **Auto mode** routes
   non-allowlisted calls through the fail-closed LLM classifier.
6. **Project `mcp.json` servers do not auto-start without project trust**, and
   tool descriptions are treated as **untrusted input** (clipped + advisory
   tagged).

## OAuth (remote servers)

- **Credential flows** (`client_credentials`, `private_key_jwt`) run
  non-interactively.
- **Browser flow** (`oauth: true` or a partial config): `/mcp auth <server>`
  opens your browser; Porcupine runs a **local-only callback server**
  (`127.0.0.1:37238`) with PKCE + CSRF state verification and a 5-minute
  timeout. Tokens are stored in the **OS keyring** (macOS Keychain / Linux
  secret-tool) with a 0600-file fallback.

## Notes

- Transports: **stdio** + **Streamable HTTP** (v2). SSE/WebSocket are
  intentionally not shipped (SSE is deprecated in the spec).
- SDK: `@modelcontextprotocol/sdk` v1 (the stateless 2026-07-28 spec era is
  handled via the manager's `server/discover` probe with `initialize` fallback).
- `mcp_resources` and `/mcpp:` are the resources/prompts surfaces; both are
  on-demand to protect the context window.
