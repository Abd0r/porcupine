---
name: secure-coding
description: Write secure-by-default code — keep secrets out of code and logs, validate all input against an allow-list, and neutralize path traversal and command injection. Use when writing or reviewing any code that touches input, files, or the shell.
stack: safety
---

# Secure Coding

Security is a property of defaults, not heroics. Assume every piece of input is hostile until proven otherwise, keep secrets out of anything that lands in a repo, and never let a string reach a shell or a filesystem path unvalidated. (Foundations align with OWASP Secure Coding Practices — validate all data from untrusted sources on a trusted system, centralize validation, and fail securely.)

## When to Use

- Writing code that accepts user/API/file/DB input.
- Opening files by name, constructing paths, or running shell commands.
- Committing anything that could carry credentials, tokens, or keys.
- Reviewing existing code for injection, secret-leak, or traversal risk.

## Procedure

1. **Keep secrets out of code and logs.** Never hardcode API keys, tokens, passwords, or connection strings. `read` `.gitignore`/`.env.example`; use environment variables (`process.env.*`, `.env` sourced at runtime) or the platform's secret store instead. When you add a secret, confirm the file that holds it is git-ignored — nothing secret may be committed even to a “private” repo.
2. **Check git history before you trust a file is clean.** A leaked secret survives in history even after it is scrubbed from HEAD. `git log --all -p -- <file>` and `git grep` the whole tree for obvious tokens. Use a secret scanner (`git stash`-style workflow, `trufflehog git file://.`, `gitleaks detect`) to find high-entropy strings. If one is found, treat it as compromised: rotate, do not just delete the line.
3. **Validate all input — allow-list, not deny-list.** Identify the trusted vs. untrusted data sources and validate every untrusted one with a centralized routine: expected type, length, and a strict allow-list of allowed characters/values. Unicode-aware: decode to a canonical form *before* validating so obfuscated input can't bypass you. On any validation failure, reject the input — do not partially sanitize.
4. **Prevent path traversal.** Never build a filesystem path by string-concatenating user input. Resolve and confine: use `path.resolve(...)` and require the result to stay inside an allowed root (`if (!resolved.startsWith(ALLOWED_ROOT + sep)) throw`). Reject `..`, absolute, and symlink-escape attempts. Treat the filename as data, not a path.
5. **Prevent command injection.** Avoid interpolating user input into a shell string (`exec(cmd)` / `bash -c` with `+`d spans). Prefer array-form exec (`spawn('git',['show',input])`) or a library that parameterizes arguments; treat every argument as a separate token, never part of the command line. If a shell string is unavoidable, validate the input against a strict allow-list or escape via an approved routine — and log/deny anything unexpected.
6. **Apply least privilege.** The process runs with the minimum permissions and inputs needed. No root by default, no world-writable paths, no broad filesystem access if a narrow root suffices. Over-fetching input increases the attack surface.
7. **Fail securely.** Error handling denies by default; surface generic errors to users and log details on a trusted system — never leak stack traces, secrets, or session ids in responses or logs.

## Pitfalls

- Hardcoding a credential “just for now” and pushing it — the exact pattern that leaks.
- Whitelisting/deny-lists that let `FULLADDRESS`, `%2e%2e`, or encoded variants slip through.
- Checking a secret was removed but forgetting it is still in `git history`.
- Putting user input in a shell string or a path and "trusting" it.
- Root/elevated processes where least privilege would do.
- Logging secrets or sensitive tokens during debugging.

## Verification

- No secret literal (API key, token, password) present in any tracked file; the config holding secrets is confirmed git-ignored and the secret store path documented.
- `git grep`/scanner shows no leaked tokens across history; any found secret flagged as compromised and rotated.
- Every untrusted input passes through a centralized allow-list validation; path resolution confined to a whitelisted root; no unsanitized user string reaches a shell command.
- The process runs with minimum privileges; error handlers fail safely without leaking internals.
