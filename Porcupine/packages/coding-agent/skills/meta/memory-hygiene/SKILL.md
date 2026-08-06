---
name: memory-hygiene
description: When and how to use memory and session_search.
stack: meta
---

# Memory & Session History

## Tools

- `memory` — durable USER.md (who) and MEMORY.md (notes)
- `session_search` — past chat transcripts on disk

## When to use memory

- Stable user prefs ("prefer pnpm", "no em dashes")
- Durable project facts that survive /new
- Not for temporary task state or secrets

## When to use session_search

- "What did we decide about X?"
- Resume prior work without re-asking the user

## Procedure

1. Prefer reading injected `<porcupine_memory>` first
2. `memory list` if unsure what is stored
3. `memory add` only for durable facts; use replace/remove to correct
4. `session_search` with a tight query; open sessionId for detail
