---
name: file-operations
description: Safely and efficiently read, search, and edit files with Porcupine's filesystem tools, avoiding destructive mistakes.
stack: filesystem
---

# File Operations

Porcupine gives you a small, precise filesystem toolset — `read`, `write`, `edit`, `grep`, `find`, `ls`, and `bash` for shell-backed operations. Reach for the right tool and you get efficient, safe edits; misuse `bash` or the tools and you can corrupt, clobber, or destroy data.

## When to Use

- Reading any file — small or large, text or image.
- Editing a file (targeted replacement) or creating one.
- Searching file contents vs. matching filenames.
- Inspecting symlinks, permissions, and file types before acting.
- Any action where a wrong keystroke could erase or corrupt data.

## Procedure

1. **See before you touch.** Run `ls` on the directory and `read` the file before editing it. Never `edit` a file you have not read — the replacement strings must match existing text exactly.
2. **Read large files in slices.** The `read` tool truncates at ~2000 lines / 50KB. Reads are 1-indexed: use `offset` and `limit` to page. For a file, use `read <path>` first to see its start, then `read <path> offset=N` to continue until you have the region you need.
3. **Find by content vs. by name.**
   - Content → `grep`. Use `literal: true` when the pattern contains regex metacharacters or when you mean a literal substring.
   - Name → `find` (glob) or `ls`. `find -name '*.ts'` style glob matching is for filenames, not text inside them.
   - `grep` output is truncated to 100 matches/50KB — narrow the scope with `path` or `glob` or bucket `limit` if your term is common.
4. **Edit with `edit`, not `write`.** `edit` does exact, non-overlapping string replacement — safe for small changes. Each `oldText` must be unique in the file; merge nearby changes into one edit block rather than overlapping edits.
5. **Create/overwrite with `write`.** `write` creates the file (and parent dirs) or overwrites the whole file. Use it for new files or full-file rewrites. Be aware `write` wipes the existing contents — never `write` a file you intend to keep only part of.
6. **Check file identity and special files before acting.** If you are about to modify something non-standard, inspect with bash:
   ```bash
   file --dereference <path>        # type + encoding
   ls -la <path>                    # symlink target, perms, size
   readlink -f <path>               # resolve absolute path
   test -L <path> && echo symlink
   ```
   Writing through a symlink writes the target — know which file you are really touching.
7. **Prefer content tools over bash for text.** For searching or viewing text, use `grep`/`read` rather than `bash` — they are purpose-built, respect `.gitignore`, and avoid shell-quoting/glob hazards.
8. **For genuinely shell-level operations** (find by mtime, dedupe, bulk rename, permissions, hard links), use `bash` deliberately and quote everything (see the shell-craft skill).

## Pitfalls

- **Editing a file you never read.** `oldText` must match exactly; if it does not match, `edit` fails — that is a safety signal, not an error to force past.
- **Overlapping/nested edits.** Two changes touching the same region produce conflicting `edit` behavior — merge them into a single edit.
- **`write` clobbering.** `write` replaces the entire file. Mixing `edit` (surgical) and `write` (whole-file) on the same target is a classic data-loss path.
- **Symlink/recursion confusion.** `find` and tools may follow or skip symlinks differently; `readlink -f` disambiguates the real path before you wipe or copy.
- **Assuming a file supports text edits.** Images and binary files sent to `read` come back as attachments; `edit`/`write` are text-oriented — do not try to string-replace in binary.
- **Destructive patterns:** `rm -rf`, `> file` (truncate), and in-place `sed -i` / `perl -i`. Verify the target, quote the glob, and prefer `grep`/`find` to confirm exactly which paths match before any delete/truncate.

## Verification

- After any `edit`: `read` the changed region to confirm the replacement landed and nothing adjacent moved.
- After a `write`: `ls -l` and `read` the head/tail to confirm size and content.
- After a delete/rename through bash: verify the inverse (target gone, intended files still present) with `ls`/`find`.
- If you edited a file through a symlink, confirm you changed the correct physical file with `readlink -f`.
