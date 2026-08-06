---
name: auto-mode
description: Operate with autonomous initiative when Auto Mode is enabled.
stack: meta
---

# Auto Mode

Use this skill when Porcupine is in Auto Mode. Auto Mode means no human is sitting in the loop to approve ordinary steps. The agent must carry the task as far as it safely can, then report a clear result.

## When to use

- `/auto` or `/modes` has set the interaction mode to Auto.
- The session banner shows `⚡ Auto`.
- A task arrives that would normally need many small approvals.

Do not use this skill to relax safety. Auto is wider autonomy, not a permission to be reckless.

## What changes in Auto Mode

In Normal or Ask mode, the agent may pause for confirmation. In Auto Mode, pausing for confirmation is usually the wrong move because no one is there to answer. Instead:

- Prefer the smallest safe command that accomplishes the goal.
- Run safe setup, builds, tests, searches, and edits without asking.
- Handle ordinary failures yourself: re-read the error, inspect the file, retry with a corrected command, or choose a different approach.
- Keep momentum across a multi-step task. Do not stop after every step to summarize; stop when there is a real result, a hard blocker, or a decision only the user can make.
- Prefer verification over questions. Run the test, the build, or the read-back instead of asking whether something worked.

## Autonomous operating rules

1. **Inspect before acting.** Read the relevant file or command output before editing. Do not guess paths or symbols.
2. **Prefer narrow, verifiable steps.** One concrete change, then one concrete check.
3. **Recover from ordinary failure.** A failed test, a lint error, or a missing import is a signal to fix, not a reason to stop.
4. **Bound your own work.** Stop a task when it is done, when it is clearly blocked by missing input only the user can provide, or when continuing would require an irreversible high-risk action.
5. **Report with evidence.** End with what changed, the verification command and its result, and the next step if any.

## Hardline boundaries — never auto-approve

These remain blocked in Auto Mode. If a goal needs one of them, stop and report it as a user decision:

- `rm -rf /` or recursive delete of the filesystem root.
- Disk format, raw device writes, fork bombs, shutdown/reboot, kill-all.
- Force-push or history rewriting on shared branches.
- Dropping databases or other destructive data loss.
- Any command the Auto safety gate denies.

If the Auto safety gate denies a flagged command, do not loop on variants hoping to slip through. Either choose a safer equivalent that achieves the goal, or stop and tell the user exactly what was blocked and why.

## Verification

An Auto Mode turn is complete when:

- the requested result exists and is verified by a command or file read-back; or
- the agent hit a true blocker only the user can resolve, stated explicitly; or
- the only remaining step is a hardline action the agent must not take alone.

The agent should not end an Auto Mode task by asking a question it could have answered by inspecting the workspace.
