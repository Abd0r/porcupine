# Porcupine Launch Film — Factual Feature Matrix

Every row verified against the repository at commit `9b2ed2cc` (2026-08-06).
Numbers verified live: **48 skills, 17 stacks, 3 max concurrent sub-agents.**

| # | Feature | Real command / tool | Real UI representation | Source reference | Deterministic to film? | Footage required |
|---|---------|--------------------|------------------------|------------------|------------------------|------------------|
| 1 | Interaction modes | `/modes` (interactive command) | Mode selector: `✋ Ask`, `🛡️ Normal`, `⚡ Auto`; selected mode + model in footer | `src/modes/interactive/components/interaction-mode-selector.ts` (labels Ask/Normal/Auto); footer component | ✅ (selector is deterministic; selecting Auto is a keystroke) | `/modes` opened, cursor moves Ask→Normal→Auto, footer with mode+model |
| 2 | Reasoning depth (separate from permission) | `/reasoning` | Thinking-level selector (off/minimal/low/medium/high/xhigh/max/adaptive) | `src/cli/args.ts` `VALID_THINKING_LEVELS`; thinking-selector component | ✅ | Brief shot of the reasoning selector after `/modes` |
| 3 | Capability discovery (read-only) | `capability_search` tool — actions `list`, `search`, `view`; user command `/stacks [query]` | Tool call line + result; status strip: `👀 Searching for skills…`, `👀 Searching for tools…`, `📖 Reading skill: <name>…` | `src/core/tools/capability-search.ts` (action union line 42, description line 114); `src/porcupine/animations.ts` lines 108–111 | ✅ (status strings are fixed; search result text is model-dependent but the tool call + status strip are real) | `capability_search` call with `action=search`, status strip visible, then reading one skill's SKILL.md |
| 4 | Skill reading | `capability_search` action=view / the skill-load path | `Reading skill: <name>…` status; SKILL.md content in the transcript (collapsed preview is by design) | `src/porcupine/animations.ts:111`; read-tool skill path | ✅ | Close on the `📖 Reading skill:` line + the skill body |
| 5 | Dynamic task graph | none (automatic) | Footer task graph: compact steps with completed/active/failed/pending states; forms from actual tool-call activity | `src/modes/interactive/components/task-graph.ts`; interactive-mode integration | ⚠️ (content is model-driven; the graph component + its states are real and deterministic) | Long shot of footer while a multi-step task runs; highlight the graph region |
| 6 | `/plan` (inspection-only) | `/plan <objective>` | Saves an implementation-ready Markdown plan; no source edits, no mutating commands | plan-mode extension; `/plan` doc in usage.md | ✅ (if shown — recommend brief separate shot or omit) | Optional: one `/plan` invocation, then NO implementation transition |
| 7 | Sub-agent spawn | `subagent` tool (agent-managed; user never chats with workers) | TUI split: main transcript `grow: 2` (top, ~2/3), panel `grow: 1` (bottom, ~1/3) while workers run, hidden at 0 height otherwise; header `🧵 Sub-agents 2/3` with spinner, one line per slot (task, step count, latest tool) | `src/modes/interactive/interactive-mode.ts` ~line 965–980 (`grow: 2` / `grow: 1`, comment "Sub-agent panel: 1/3 of the flexible area… the main transcript keeps 2/3"); `src/modes/interactive/components/subagent-panel.ts` (header line 75) | ✅ (panel geometry is deterministic; slot content is real run output) | **NOTE: the split is VERTICAL (panel below main), not left-right** — the brief's "main left / worker right" is incorrect; capture the real top/bottom layout |
| 8 | Sub-agent max concurrency | `subagent.maxConcurrent` setting (default 3) | `🧵 Sub-agents 1/3` → `2/3` in the panel header | `src/core/settings-manager.ts:29,838`; panel header | ✅ | Panel showing `x/3` slots |
| 9 | Live steering (WoT) | `send_to_subagent` tool (main→worker) | Tool call in the main session; the message enters the worker's live context before its next step | `src/core/tools/subagent.ts:160,168` (tool description), `src/core/subagent-messaging.ts` | ✅ (the tool call is real; the worker visibly continues after receiving it) | Main agent invoking `send_to_subagent`, worker slot continuing |
| 10 | Worker report injection | `subagent` completion | Report lands in the main session **immediately** (steered mid-turn or fresh turn when idle — never waits for the next user prompt) | `src/core/tools/subagent.ts:160` ("injected into the session INSTANTLY") | ✅ | Worker finishing → report visible in main transcript without any user input |
| 11 | Recovery + verification | normal agent loop in Auto mode | Failed test output → agent reads files → edits → reruns focused test → runs full check → green | the run itself | ✅ (the demo repo guarantees a genuine failure then a fix) | Failed test, diagnosis reads, edit, focused test pass, full suite pass |
| 12 | Autonomous learning | `/learning feed` | Live activity feed: evidence-graded entries, snapshots, rollback status | `src/modes/interactive/learning-command.ts`; `src/modes/interactive/components/learning-graph.ts:124` | ⚠️ (only if the demo run genuinely produces an evidence-backed event; otherwise omit per brief) | Only if real: `/learning feed` showing the genuine event |
| 13 | Safety posture | permission policy | Mode + safety status in the footer; Auto retains fail-closed gates | modes + auto-mode implementations | ✅ (footer shows real mode/model) | Footer close-ups; no claim of sandboxing |
| 14 | Session/verification state | (automatic) | Task graph completion, final git diff | task-graph component; git tools | ✅ | Final graph + diff summary |

## Numbers verified at render-time baseline

- Skills: **48** (`find skills -name SKILL.md | wc -l` = 48) — the brief's "47 SKILLS / 17 STACKS" must be updated to **48 / 17**.
- Stacks: **17** (`ls skills/ | wc -l` = 17).
- Max concurrent sub-agents: **3**.

## Reality corrections vs the brief (from source inspection)

1. **Sub-agent panel geometry is vertical, not side-by-side.** `interactive-mode.ts` lays the panel into the row stack with `grow: 1` under the main transcript's `grow: 2` (panel below, hidden at 0 height when idle). The film should capture/annotate the real top-bottom split; do not construct a left/right split.
2. **`capability_search` never downloads or installs anything** — it is read-only discovery over the existing catalog. Represent it as search + view only.
3. **The task graph is a compact footer strip**, not a large animated DAG.
4. **Version shown in the film**: the repo is at `v0.1.41` (npm `@porcupineai/porcupineai`). End-card version text should say **v0.1.41** (brief says v0.1.0 — stale).
5. `/plan` is inspection-only; the main demo should be a normal Auto-mode objective without `/plan`.
