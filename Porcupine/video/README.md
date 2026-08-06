# Porcupine Launch Film — Production Workspace

A cinematic launch video for Porcupine, built from **real Porcupine TUI footage**
and **real behavior only** — no mocked interfaces, no fabricated output.

## Status

- ✅ **Inspection** — features verified against source (`factual-feature-matrix.md`)
- ✅ **Storyboard** — corrected against reality (`storyboard.md`)
- ✅ **Demo repository** — `demo-repository/` with a deterministic cache-invalidation bug
  - `demo-before` tag: `node --test` → 1 pass / 2 fail
  - `demo-fixed` tag: → 3 pass / 0 fail
- ✅ **Capture script + redaction checklist** (`capture-script.md`, `redaction-checklist.md`)
- ⏳ **Production** — Remotion project (`src/`), terminal capture runs, sound, renders

## Layout

```
video/
├── storyboard.md              # timed scenes, corrected against source
├── factual-feature-matrix.md  # every feature: command, UI, source ref, determinism
├── capture-script.md          # one real run: modes → objective → sub-agents → steering → fix
├── redaction-checklist.md     # secrets, personal info, product-accuracy rules
├── demo-repository/           # the filmed project (tags: demo-before, demo-fixed)
├── src/                       # Remotion composition (porcupineai launch)
│   └── components/            # TerminalFrame, LogoAssembly, KineticText, FocusRegion, ...
├── public/
│   ├── assets/                # logo, fonts, branding
│   ├── captures/              # raw terminal footage
│   └── audio/                 # sound design
└── README.md
```

## Non-negotiables (from the brief + source inspection)

- Every product shot = real Porcupine TUI, one unedited master preserved.
- Sub-agent split is **vertical** (main transcript ~2/3 top, panel ~1/3 bottom) — verified in `interactive-mode.ts`.
- `capability_search` is read-only discovery. `/plan` is inspection-only (omitted from the main demo).
- No benchmark numbers, no user↔sub-agent chat, no sandbox claim.
- Numbers at render time: **48 skills, 17 stacks, v0.1.41** (verified 2026-08-06).

## Demo objective (the filmed task)

> Investigate and fix the failing cache invalidation behavior. Add regression coverage, inspect whether repeated writes or concurrent state updates are affected, and verify the complete project. Use a focused sub-agent for independent diagnosis while you continue investigating.

Steering message queued mid-run:

> New clue: the failure only appears after the second write. Redirect the active worker toward lifecycle and stale-state handling.

## Renders (deliverables)

- `porcupine-launch-4k.mp4` (3840×2160, 30fps)
- `porcupine-launch-1080p.mp4`
- `porcupine-launch-vertical.mp4` (1080×1920, if readable)
- Plus: raw capture, recording commands, demo tags, render command, Porcupine commit, model config, cut list.
