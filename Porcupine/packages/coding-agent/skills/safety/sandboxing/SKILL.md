---
name: sandboxing
description: Isolate risky work before it can hurt you — run untrusted code in a container, put experiments in a disposable clone, and use Porcupine's mode settings and Escape-cancel to contain yourself. Use whenever work could be destructive, untrusted, or hard to reverse.
stack: safety
---

# Sandboxing

Isolation is the cheapest insurance you can buy, and it scales with how much you trust the code. Untrusted or AI-generated code, destructive rebuilds, and throwaway experiments belong in a disposable sandbox — never raw in your real working tree. Match the isolation depth to the risk: a read-only dir for a quick check, a Docker container for untrusted code, a microVM/throwaway VM only when even a container escape is unacceptable (containers share the host kernel, so treat them as *input safety* not perfect containment).

## When to Use

- Running code you did not write or fully trust (npm/pip packages with unknown maintainers, fetched scripts, LLM-generated code).
- An experiment that may mutate files, delete things, or leave stray processes — clone first, experiment in the clone, discard it.
- Commands that are destructive or irreversible (`rm -rf`, db resets, migrations, `git push --force`).
- Anything that needs a specific dependency/environment you do not want to pollute your main setup with.

## Procedure

1. **Decide isolation depth by trust.** Trusted edits: work in place. Semi-trusted/experimental: disposable clone. Untrusted input or code: Docker container with minimum privileges. Read-hostile: microVM. When in doubt, take the next level up — sandboxing costs seconds, a leak costs hours.
2. **Use containers for untrusted code.** Pull a minimal, pinned image (`python:3.12-slim`, `node:20-alpine`), mount only what it needs with `docker run --rm -v "$PWD":/work -w /work --user $(id -u):$(id -g) IMAGE cmd`, refuse `--privileged`, and avoid binding/mounting your secrets or home dir. Run as non-root so a compromise has nowhere to climb. `--rm` guarantees the container is destroyed on exit — nothing leaks back.
3. **Experiment in a disposable clone.** Before a risky or mutating change: `git clone` (or `git worktree add`) into `/tmp/exp`, do the experiment there, and discard. This keeps your real checkout clean and re-runnable. Keep an explicit `NO TOUCH: <path>` list for anything the experiment must not alter.
4. **Respect Porcupine's interaction modes — confirm or gate, don't guess.** In **Ask** mode every command and edit is confirmed; in **Normal** safe commands run and *flagged* ones are confirmed; in **Auto** the LLM safety gate handles flagged commands. Porcupine runs dangerous/flagged commands through a `commandGuard`. When doing something destructive: prefer Ask/Normal so *you* explicitly approve it, and never state “just run it, it's fine” in Auto for an irreversible action.
5. **Never run a destructive command without verification.** Show the command and its arguments fully; confirm the target path exists and is the one you mean (`ls -la` it). Prefer a reversible step (`mv` to a backup dir) over unrecoverable delete when possible. Verify with a real read (file exists/removed, no side targets) before and after.
6. **Contain yourself with Escape-cancel.** A long-running, possibly-unwanted operation can always be stopped: Escape with an empty editor cancels running work (and sub-agents) (`⏹ Sub-agents cancelled`). Use it early and often rather than letting a runaway job burn budget or mutate state.
7. **Use `subagent` + `literature` for heavy isolation.** Delegate a risky experiment to a `subagent` with a tight step cap and its own budget; the report comes back into the main context while the main tree stays untouched. Record reproducible parts in `literature` so the isolation is not thrown away with the container.

## Pitfalls

- Running untrusted code directly in your real home/repo because “it's probably fine”.
- Docker without `--rm`, running as root, or mounting your whole home dir/`~/.ssh` into a container.
- A risky experiment in the live checkout instead of a disposable clone.
- Letting a destructive command run in **Auto** where the LLM gate — not you — approves it.
- Assuming a container is a VM: shared-kernel escapes are possible, so secrets and host files never go in with untrusted code.
- A runaway job left to run because cancelling felt costly.

## Verification

- Isolation level chosen and justified by the trust level of the input, stated in the report.
- Untrusted code ran in a `docker run --rm` (or stronger) with non-root user, no privileged, no secret mounts.
- Experiments confined to a disposable clone/worktree in /tmp, list of NO-TOUCH paths respected.
- Destructive command reviewed with full args + target confirmed (`ls -la`) before execution; reversible where possible.
- Modes used deliberately (Ask/Normal for destructive work); Escape-cancel available and used to stop anything unwanted.
- Heavy/risky work delegated with a `subagent` step cap; main tree left clean.
