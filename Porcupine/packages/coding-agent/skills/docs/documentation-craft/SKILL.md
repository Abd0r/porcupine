---
name: documentation-craft
description: Write and maintain README, CHANGELOG, guides, and code comments that stay accurate and current — verified against source, never imagined. Use when creating or editing any user-facing or developer-facing docs.
stack: docs
---

# Documentation Craft

Docs rot when they drift from source. The job is not to sound polished — it is to be **accurate and current**. A correct one-liner beats a beautiful, wrong paragraph. Before writing a claim about behavior, prove it against the code; before writing a version note, read the diff.

## When to Use

- Creating or updating a README, architecture note, API guide, or migration doc.
- Editing a CHANGELOG (new release, unreleased section, credit lines).
- Writing or revising code comments/docstrings for a module you are touching.
- A doc already exists but the code moved — hunting staleness and fixing it.

Skip for a one-line phrasing tweak with no factual content, and for throwaway scratch notes.

## Procedure

1. **Verify every factual claim before writing it.** For each behavior, flag, or default you plan to state, locate the source:
   `grep "symbolName" . -r --include="*.ts"` and `read` the defining file. Quote the exact `file:line`. Never state an option's name, default, or error message you have not seen in code.
   If the claim is "documented elsewhere only" (e.g. a vendor contract), say so instead of asserting.
2. **Anchor to a concrete example.** Favor a short runnable snippet the README's audience can copy — a CLI invocation, a config key, a minimal API call. Extract usage from real entry points with `read` rather than inventing signatures.
3. **Read the diff before writing CHANGELOG entries.** For an unreleased section: `git diff <last-release-tag>..HEAD --stat`, then `git diff -- <dir>` on the changed areas. Write `type(scope): subject`-style entries that say *what changed and why it matters*, not “fixed bug”. Credit non-author contributors.
4. **Update docs in the same change as the code.** If you edit a function, grep for comments that describe it and fix them in the same edit set. Timestamp/date the release section only when the release actually ships.
5. **Re-check consistency at the end.** Re-run the greps for symbols you cited. If a doc says “default is X”, re-read the definition once more. There is no faster way to keep docs honest than to re-verify what you wrote.
6. **For contributed docs, note provenance.** If a doc duplicates an upstream model card or vendor table, link it and mark what you verified vs. carried over.

## Pitfalls

- Inventing flags, defaults, function names, or CLI options the code does not have — the single most common doc bug.
- Copy-pasting a claim from an older doc “because it used to be true”. Stale docs need a `read`, not a re-emit.
- Writing aspirational prose (“seamlessly”, “effortlessly”) that adds no verifiable fact.
- Writing CHANGELOG from memory instead of `git diff`.
- Polishing grammar while facts are still wrong — you spend effort on the wrong layer.
- Over-nesting references in docs so they are hard to keep in sync (agentskills guidance: keep linked files one level deep).

## Verification

- Every symbol, default, path, and CLI flag mentioned was observed in source (`grep` + `read`) — list the `file:line` you confirmed in your report.
- One runnable example per doc; it was traced through real code, not invented.
- CHANGELOG entries derive from an actual `git diff`, with credits for non-authors.
- Comments changed alongside the code they describe; no comment now contradicts the implementation.
