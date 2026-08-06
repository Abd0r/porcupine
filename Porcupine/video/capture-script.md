# Porcupine Launch Film — Capture Script

One real Porcupine run, recorded unedited, then cut/time-compressed for the film.
**Never splice output to imply one command caused an unrelated result.**

## Environment

- Terminal: Ghostty or Kitty (truecolor, no window decorations for clean capture)
- Font: readable monospace, ~16–18pt (JetBrains Mono / Iosevka)
- Porcupine commit: **pin the exact commit** (`git rev-parse HEAD` at capture time)
- Model/provider: **record exactly** (`porcupine --model ...`, provider, reasoning level)
- Settings: `~/.porcupine/agent/settings.json` snapshot saved with the capture
- Theme: Porcupine dark theme (real)

## Recording

- `ffmpeg -f avfoundation -framerate 30 -i "capture device" -pix_fmt yuv420p raw-capture.mkv` (or screen-recorder of choice; preserve the full master)
- Terminal window: 4K or highest practical; keep the footer + panel fully visible
- Disable notifications; use a clean temp HOME; hide real API keys (use a throwaway key or env-var placeholder)

## Sequence (one continuous run unless noted)

1. **Boot + modes**: launch `porcupine` in the demo repo; `/modes` → select Auto; `/reasoning` shot.
2. **Objective**: paste the demo objective (below). Let Porcupine work: reads, `node --test` (2 failures), greps, `capability_search` search + skill read.
3. **Sub-agent**: the objective instructs the main agent to spawn a focused worker. Wait for the panel (`🧵 Sub-agents 1/3`) + the vertical split.
4. **Steering**: after the main agent discovers the first-write-wins clue, queue the real steering message (below). The agent uses `send_to_subagent`.
5. **Report**: let the worker finish; its report lands immediately.
6. **Fix + verify**: agent edits `src/cache.js`, reruns focused + full tests (green), shows `git diff`.
7. **Learning (conditional)**: if a genuine evidence-backed learning event occurred, `/learning feed` shot.
8. **End**: exit or final task-graph state.

## Demo objective (paste exactly)

> Investigate and fix the failing cache invalidation behavior. Add regression coverage, inspect whether repeated writes or concurrent state updates are affected, and verify the complete project. Use a focused sub-agent for independent diagnosis while you continue investigating.

## Steering message (queue after the first-write clue appears)

> New clue: the failure only appears after the second write. Redirect the active worker toward lifecycle and stale-state handling.

## Post-capture

- Keep the full unedited master (`raw-capture.mkv`).
- Log: exact Porcupine commit, model/provider, settings, prompts, demo-repo commit, every cut/time-compression.
- Redaction pass per `redaction-checklist.md` BEFORE any edit.

## If the run doesn't exhibit the required behavior

Do NOT fake it. Improve the deterministic setup (demo repo wording/task) and record another genuine run. The demo repo is engineered so the failure appears deterministically after the second write.
