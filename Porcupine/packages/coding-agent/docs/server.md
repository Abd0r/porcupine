# Headless Server (`porcupine serve`)

`porcupine serve` runs the agent as a headless HTTP service so other clients can
drive a session programmatically: IDE plugins, web or mobile apps, CI scripts,
and automation. It is the server surface behind the interactive TUI (the TUI is
just one client), mirroring the OpenCode-style server architecture.

## Starting the server

```bash
porcupine serve --port 4096 --token <secret>
```

| Flag | Default | Description |
| ---- | ------- | ----------- |
| `--port` | `4096` | Port to listen on. `0` picks a free port. |
| `--host` | `127.0.0.1` | Host to bind. Only loopback is allowed without a token. |
| `--token` | env `PORCUPINE_SERVER_TOKEN` | Optional bearer token. **Required** when binding a non-loopback host. |

The server shares the exact runtime bootstrap of the CLI: project trust,
providers, settings, extensions, and the current session's model + permission
policy. It runs in-process with the interactive session machinery and shuts
down cleanly on SIGINT/SIGTERM.

## Authentication

When a token is configured, every request must carry it:

```
Authorization: Bearer <token>
```

Requests without it get `401`.

## Endpoints

All bodies are JSON. `:id` is the session id returned by `POST /session`.

### GET /health

```json
{ "healthy": true, "version": "0.1.45" }
```

### GET /session

```json
{ "sessions": [{ "id": "session-id" }] }
```

### POST /session

Creates (or returns) a session. Responds `201`:

```json
{ "sessionId": "session-id" }
```

### POST /session/:id/message

Send a prompt to the session. The session runs asynchronously; respond `202`
immediately.

```json
{ "text": "investigate the failing test" }
```

Errors: `400` for empty/invalid text, `404` for a wrong session id.

### POST /session/:id/abort

Aborts a running turn. Responds `200 { "ok": true }`.

### GET /session/:id/status

```json
{ "id": "session-id", "streaming": false }
```

### GET /session/:id/events

Server-Sent Events stream of the session: message starts/ends, thinking, tool
calls, and permission requests. Each event is a JSON `data:` line:

```
data: {"type":"message_start","...":...}
data: {"type":"permission_request","permissionId":"perm-...","title":"...","message":"..."}
```

A heartbeat comment (`: ping`) is sent every 15 seconds to keep the connection
alive.

### POST /session/:id/permissions/:permissionId/response

Programmatically answer a pending permission request surfaced over SSE (the
session's confirm callback, the same gate Ask/Normal/Auto use):

```json
{ "allow": true }
```

Responds `200 { "ok": true }`; `404` when no request with that id is pending.
Unanswered requests time out as denied after 60 seconds.

## Example (curl)

```bash
BASE=http://127.0.0.1:4096
AUTH="Authorization: Bearer $TOKEN"

curl -s $BASE/health -H "$AUTH"
SID=$(curl -s -X POST $BASE/session -H "$AUTH" | jq -r .sessionId)
curl -s -X POST $BASE/session/$SID/message -H "$AUTH" -H 'content-type: application/json' \
  -d '{"text":"run the focused tests"}'
curl -sN $BASE/session/$SID/events -H "$AUTH"
```

## Safety

- The server is attended: it runs inside the interactive session process and
  stops when the session closes. It does not add unattended execution.
- Loopback-only by default; a token is mandatory for any non-loopback bind.
- Permission requests still require an explicit `allow` — nothing is
  auto-approved through the API.
