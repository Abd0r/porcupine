# Porcupine Launch Film — Storyboard (corrected against source)

Duration target: **65–80 s** · Master: 3840×2160 @ 30fps · Terminal footage: real Porcupine TUI.

## Reality corrections baked into this storyboard

- Sub-agent split is **vertical** (main transcript top / panel bottom), per `interactive-mode.ts` (`grow: 2` / `grow: 1`). No left-right split.
- Skills count is **48 / 17 stacks** (verified), version **v0.1.41**.
- `/plan` omitted from the main demo (inspection-only by design).
- Capability search is read-only discovery — no plugin/install imagery.
- The main demo is a normal Auto-mode objective: the exact demo-repository task.

---

### 0:00–0:04 — CURSOR
Black. One blinking terminal cursor. Monospace text types:

> A MODEL CAN REASON.
> AN AGENT HAS TO ACT.

Cut on a low mechanical impact (film-grain spike + sub-bass thump).

### 0:04–0:09 — PORCUPINE
Porcupine logo assembled from its block geometry (the real banner block-mark). Text:

> PORCUPINE
> A TERMINAL AGENT FOR REAL REPOSITORIES

### 0:09–0:15 — CONTROL
Real TUI boots. Open `/modes`; cursor moves Ask → Normal → Auto; select Auto. Brief `/reasoning` shot. Footer stays visible (mode + model). Text:

> YOU CONTROL HOW FAR IT CAN ACT

### 0:15–0:25 — OBJECTIVE
The user types the demo objective. Porcupine reads files (`read` calls), runs tests (`node --test` → 2 failures), searches symbols (`grep`). The footer task graph forms — **highlight the real compact strip** (completed/active/failed/pending). Text, one phrase at a time:

> READS THE REPOSITORY / BUILDS CONTEXT / KEEPS MOMENTUM

### 0:25–0:33 — CAPABILITY SEARCH
Real `capability_search` call (action=search). Status strip: `👀 Searching for skills…`. Then `action=view` → `📖 Reading skill: <name>…` + the real SKILL.md in the transcript. Motion: thin lines connect the search result to the skill body; magnify real output. Text:

> 48 SKILLS / 17 STACKS / SEARCHED WHEN NEEDED

### 0:33–0:48 — PARALLEL WORK (centerpiece)
Main agent invokes the real `subagent` tool with the diagnosis task. The TUI **vertically** splits: main transcript (top ~2/3) continues; panel (bottom ~1/3) shows `🧵 Sub-agents 1/3`, worker task, step count, latest tool. Main agent keeps investigating (reads, greps). Text:

> THE MAIN AGENT DOES NOT WAIT

Then the clue is queued. Main agent invokes **`send_to_subagent`** with the redirect; the worker panel continues (its context now carries the new direction). Text:

> DELEGATE / CONTINUE / STEER LIVE WORK

### 0:48–0:59 — REPORT AND FAILURE
Worker finishes → its report enters the main transcript **immediately** (no user input). Then the real focused test failure (`node --test` red). Restrained red accents, music drops. Text:

> FAILURE BECOMES NEW EVIDENCE

Main agent reads the failure, inspects `cache.js`.

### 0:59–1:09 — FIX AND VERIFY
Real edit of `src/cache.js` (drop the first-write-wins guard), regression test present, focused test green, full suite green, final `git diff` summary, task graph reaches completion. Text:

> EDIT / RETRY / VERIFY

No cut until verification visibly completes.

### 1:09–1:15 — LEARNING (only if real)
Run `/learning feed`; show the genuine evidence-backed event + snapshot status. If the run produced none, replace with the final task-graph/session state shot. Text (only if real):

> LEARNS FROM VERIFIED EXPERIENCE

### 1:15–1:20 — END
Fade to black. Logo reassembles. Text:

> PORCUPINE v0.1.41
> TERMINAL-FIRST · OPEN SOURCE · BUILT TO GET REAL WORK DONE
> github.com/Abd0r/porcupineai

End on a blinking cursor. Sound cuts to silence.

---

## Non-negotiables
- Every product shot is captured from one real Porcupine run (unedited master kept).
- No `/plan` → implementation transition. No benchmark numbers. No fake tool output.
- No user↔sub-agent chat. No sandbox/security claim beyond the real footer state.
- Learning scene is conditional on a genuine event.
