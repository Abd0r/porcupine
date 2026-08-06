# Sub-Agents: Parallel Isolated Workers

Porcupine's sub-agent system delegates self-contained work to isolated workers
that run **in parallel** with the main agent. It is one of Porcupine's most
distinctive capabilities — and one of the best in the class.

## The model

- The main agent (you see it in the TUI) can spawn up to
  `subagent.maxConcurrent` sub-agents (default 3).
- Each sub-agent gets a **fresh context window** (128K–256K) and a **hard
  step budget**. It cannot read the main agent's context, and it cannot spawn
  its own sub-agents.
- Sub-agents get the **whole tool stack** minus agent-level tools: no
  `subagent` (no recursion), no `ask_question` (workers can't ask you), no
  `computer_use` (GUI control is attended-only), and no `tasks`/`projects`
  (agent-level durable state). They have `capability_search`, so the full
  skill catalog is reachable too (`capability_search` → `read SKILL.md`) —
  they can match main-agent performance on research, refactors, and audits.
- Sub-agents run on their own model (`subagent.model`), usually a cheaper one,
  so delegation saves both context and cost.
- The tool returns immediately: the main agent keeps working while the
  sub-agent runs in the background.

## Instant report injection

When a sub-agent finishes, its report is injected into the main agent's
context **the moment it completes** — steered into the running turn if the main
agent is mid-task, or a fresh turn if it is idle. It is **never gated on your
next prompt**. The main agent can then fold the result into its own work.

## WoT (Web of Thoughts)

Sub-agents sharing a `peerGroup` can message each other and the main agent
**live** (audited message bus). The main agent can steer a running worker with
`send_to_subagent` — refine the target, ask for status, redirect mid-task.
This turns flat fan-out into real coordination: planner/executor/reviewer
patterns, parallel research that merges findings, and agent teams.

## Escaping and control

- **Stopping sub-agents**: the MAIN AGENT can stop workers directly with the
  `stop_subagent` tool — one by id (`stop_subagent { "id": "sa-..." }`) or all
  of them (`stop_subagent {}`) — when a worker is stuck, off-track, or no
  longer needed; a stopped run reports `⏹ cancelled` instead of completing.
  The user can also press **Escape** (with an empty editor) to cancel all
  running sub-agents — the session shows `⏹ Sub-agents cancelled`. Session
  abort and teardown also cancel them.
- The footer shows the live sub-agent count to the LEFT of the provider
  (`🧵 2/3 (opencode-go) deepseek-v4-flash • ⚡ Auto • high`). There is no split
  panel — sub-agent state lives entirely in the footer.
- While ANY sub-agent runs, the footer shows their live activity **beside the
  🧵 thread counter**, left of the provider/model: `🤖(📄 Extracting, 🌐 Searching) • 🧵 0/3 • (opencode-go)
  deepseek-v4-flash • 🛡️  Normal • high`, animated. Slot order — position 1 =
  first sub-agent, position 2 = second, … — comma-joined, fully dynamic up to
  `subagent.maxConcurrent`. The status strip stays the main agent's.

## Budgets and verification

- Sub-agents stop at their step/context budget — always check `budgetExhausted`
  in their report.
- Treat sub-agent reports as claims, not facts: verify before trusting (the
  main agent is responsible for the final result).

## Configuration

```json
// ~/.porcupine/agent/settings.json
{
  "subagent": {
    "maxConcurrent": 3,
    "maxSteps": 120,
    "contextWindow": 256000,
    "model": "some-cheaper-model"
  }
}
```

## When to use them

Use a sub-agent for self-contained work that would otherwise pollute the main
context: long research, big refactors, audits, multi-file drafts. Give an exact
task (input paths, deliverable, where to put results) plus notes for
constraints. For live coordination between workers, give them the same
`peerGroup`.

## Security notes

Sub-agents share your cwd, permission policy, and safety gates — they are not
a sandbox. They cannot ask you questions, and they cannot spawn sub-agents.
Treat their output as untrusted until verified, exactly like any tool output.
