---
name: codebase-discovery
description: Orient in an unfamiliar codebase — map the repo, locate symbol definitions vs usages, trace call paths, and understand build/test setup before editing.
stack: discovery
---

# Codebase Discovery

Before changing code you must know where things live, how they connect, and how they are built and tested. This skill is a deterministic mapping routine using `ls`, `find`, `grep`, and `read` — no guessing, no invented paths.

## When to Use

- First contact with a repo: get its layout, entry points, and dependency graph.
- Find where a symbol is defined vs. every place it is used.
- Trace a call path (a function → its caller → the module → the entry point).
- Identify build/test/dev commands before you edit or verify.
- Scope a change cleanly so you do not modify the wrong copy.

## Procedure

1. **Map the top level.** `ls` the repo root. Note the obvious seams: `src/`, `lib/`, `packages/`, `tests/`, config files.
2. **Read the manifests to learn the shape.** Hunt for and read `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `requirements.txt`, `tsconfig.json`, `Makefile`, `README*` with `find` and `read`. These reveal entry scripts, deps, scripts, and test runners.
   ```bash
   find . -maxdepth 2 -name 'package.json' -o -name 'pyproject.toml' -o -name 'go.mod'
   ```
3. **Find entry points.** Grep for the executable/main hooks: `"main"` in `package.json`, `if __name__ == '__main__'` / `def main(`, `func main()`, scripts in `bin/`. Read the entry file to learn what calls what.
4. **Locate definitions vs. usages.**
   - Definitions usually follow a pattern: for a function `foo`, definitions match `(def|function|const|val|def)\s*foo\b` or `foo(` in a declaration context; languages differ.
   - Usages are every bare `foo(` elsewhere. To separate, first grep for the definition signature, then grep (case-sensitive) for the bare name:
     ```bash
     grep -rn "def foo\|function foo\|const foo\|\bfunc foo" src/   # definitions
     grep -rn "\bfoo(" src/                                          # all occurrences
     ```
   - Combine with `glob` to scope to source, excluding tests/build first so you read real usages.
5. **Trace the call path.** Pick the definition, `read` its surrounding file to see imports/requires, follow the caller upward. Use `grep -rn "require('...'/import ... from '...')"` to map module dependencies; walk the chain until you reach the entry point. Draw the path mentally: file → exported symbol → importing caller → module → entry.
6. **Understand build and test.**
   - Read the `scripts`/`Makefile`/CI config (.github/workflows) to learn build, typecheck, lint, and test commands.
   - Find the test file that already exercises the symbol (grep the symbol name in the tests dir) — it is your verification target and your best contract.
7. **Only now scope the edit.** With entry points, the symbol, its call path, and the build/test command known, decide exactly which files change and how you will verify (see planning-and-task-breakdown).

## Pitfalls

- **Inventing paths** — run `find`/`ls`; never assume a file exists because it sounds right.
- **Confusing definition with usage** — a def line and a call line look alike to a naive grep; use the language-specific signature pattern and narrow with `glob`.
- **Multiple copies** — a symbol may exist in `src/`, `dist/`, and `node_modules`. Build artifacts and dependencies are NOT source; exclude them with `glob`/`path` scope so you do not edit the built copy.
- **Diacritics/duplicates** — case-sensitive flags matter for languages where `Foo` and `foo` differ; do not assume.
- **Skipping manifests** — editing without knowing the test command means you cannot verify; the harness checks nothing for you.
- **Ignoring existing tests** — the fastest oracle for "did I break it" is the test that touches the symbol; find and run it.

## Verification

- Every path you plan to edit was confirmed by `ls`/`find`, and every symbol you reference was located by `grep` (definition + at least one usage).
- You can state the entry point and the build/test command you will run after editing.
- The call path from entry point to the code you will change is traced and consistent with what you read, not assumed.
- The existing test for the symbol is located and runs green before your change.
