---
name: shell-craft
description: Write reliable shell commands — correct quoting, pipes, exit-code checks, and knowing when to use a purpose-built tool instead of bash.
stack: shell
---

# Shell Craft

`bash` is Porcupine's escape hatch for operations the purpose-built tools do not cover. Done well it is fast and precise; done carelessly it silently mangles data. This skill is about correctness: quoting, control flow, exit codes, timeouts — and choosing the right tool for the job.

## When to Use

- Operations with no dedicated tool: piped text processing, file globbing, permission changes, process/network inspection, command substitution, loops.
- Confirming environment or artifact state (versions, sizes, what is running).
- Quick one-off checks where spinning up `grep`/`find`/`read` would be overhead.

**When NOT to use bash** — use the purpose-built tool instead:
- Searching text → `grep` (respects `.gitignore`, no quoting/glob traps).
- Matching filenames → `find`.
- Reading/editing files → `read`/`edit`/`write`.
- These avoid whitespace/glob/shell-parsing bugs entirely.

## Procedure

1. **Asset the shell.** If a command depends on options or the environment, check first:
   ```bash
   command -v jq node rg curl git
   bash --version
   ``` 
   Do not assume `jq` or `rg` exist — fall back or verify.
2. **Quote everything that moves.** Wrap paths, values, and especially anything user- or variable-derived in single quotes (`'...'`) unless you need the shell to expand it. Expand deliberately with double quotes (`"$var"`) — the quotes prevent word-splitting on spaces:
   ```bash
   head -n 20 "my folder/report final.md"   # safe
   head -n 20 $dir                          # WRONG — splits on spaces
   ```
3. **Beware globs and special files.** Unquoted `*` matches filenames; when none match it stays literally `*`. Spaces, `(`, `)`, `[`, `&`, `;` inside names break unquoted commands. If a path might contain anything, single-quote it.
4. **Read exit codes.** Every command returns an exit status; `echo $?` (or use it inline) tells you success (0) or failure. Verify critical commands:
   ```bash
   cp a b; echo "cp exit=$?"
   ```
5. **Understand `set -euo pipefail` semantics** (the recommended strict mode):
   - `set -e` — exit on any command failure.
   - `set -u` — error on unset variables (avoid typos in empty vars).
   - `set -o pipefail` — a pipeline's exit status reflects the last failing command, not just the last command.
   For scripts or multi-command blocks, prefix with `set -euo pipefail` so errors surface instead of silently passing data through a broken pipe.
6. **Use pipes deliberately and check the tail.** A pipeline is only as good as its last stage. When chaining, confirm the upstream really produced what you expect:
   ```bash
   cat data.csv | cut -d, -f2 | sort -u | wc -l
   ```
7. **Respect timeouts.** Long-running or hung commands block your budget. Wrap risky calls with an explicit `timeout`:
   ```bash
   timeout 10 curl -sI https://example.com
   timeout 5 grep -R pattern .
   ```
   If a web fetch or heavy scan might hang, always bound it.
8. **Prefer read-only to destructive in exploration.** Use `cat`, `wc`, `du -sh`, `ls` to inspect; reserve writes (`rm`, `>`, `mv`) for when you have confirmed the target.

## Pitfalls

- **Unquoted variables/substitutions** splitting on spaces or being empty — the most common silent bug.
- **`set -e` surprising you**: a failing command like `grep` that finds nothing returns non-zero and (with `-e`) aborts a script. Guard with `|| true` when a no-match is expected.
- **Pipeline masking errors**: without `pipefail`, `cmd1 | cmd2` reports success when only `cmd2` succeeds. Use it.
- **`$?` gone stale**: it reflects the last command run; capture it immediately after the command you care about.
- **Glob not matching** stays literal `*` and can `rm` a file literally named `*`. Test with `ls` first.
- **Unbounded commands** (large greps, network fetches) burning step/token budget — always `timeout`.
- **Using bash for text search/read/edit** when `grep`/`find`/`read` are safer and `.gitignore`-aware.

## Verification

- After writing any shell logic, re-run it through a no-op echo or a `set -n`/dry-run where possible before executing destructively.
- Confirm exit codes of critical steps: `echo $?` after the operation.
- For a multi-stage pipeline, sanity check the final count/output (`wc -l`, `head`) against expectation.
- When you relied on `set -euo pipefail`, intentionally test the failure path so you know it traps, not continues.
