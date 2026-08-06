---
name: repro-fix
description: Reproduce bugs, isolate cause, fix, verify.
stack: debug
---

# Repro → Fix → Verify

## When to use

Failing tests, stack traces, regressions, "it broke".

## Procedure

1. Capture the exact error and reproduction steps
2. Find the first failing assertion or stack frame in *this* repo
3. Form one hypothesis; test it with a minimal change or probe
4. Fix the class of bug, not only the symptom site
5. Re-run the original failing command

## Pitfalls

- Do not shotgun-edit unrelated files
- Do not claim fixed without re-running the failure
