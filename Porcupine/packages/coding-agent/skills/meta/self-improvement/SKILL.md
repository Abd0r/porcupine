---
name: self-improvement
description: >
  The change contract for updating Porcupine's own code. Use whenever the agent
  (or a contributor) modifies the Porcupine codebase itself — not for ordinary
  user work. Covers docs, checks, tests, packaging, releases, and the
  self-improvement loop.
stack: meta
---

# Self-Improvement — the Porcupine change contract

Porcupine improves its own code. That power needs guardrails: every change to
the product must pass the same bar a careful maintainer would set. This skill
is that bar.

## When to use this

- You are editing files under `Porcupine/` (packages, scripts, docs, skills).
- You are about to ship a change to the product (commit, npm publish, release).
- You are doing an autonomous-improvement pass (refiner, learning proposals).

Not for: ordinary user tasks in a project the agent is just working on.

## The non-negotiables

1. **No secrets, no internal leaks.** The public repo + npm package must never
   contain: `.env`, `auth.json`, tokens, `bug-reports/`, `research/`,
   `benchmarks/`, `.pi/`, `Project/`, `tui-plan.md`. They are gitignored AND
   excluded from the npm tarball. The npm tarball also excludes: `node_modules`
   (except the bundled `@porcupineai/*` internals), `.venv`, `__pycache__`,
   `._*` (AppleDouble), `.DS_Store`, `.husky`.
2. **Docs move with code.** User-facing behavior changes update: `README.md`,
   `docs/`, `agent-home/PROMPT.md`, `agent-home/AGENTS.md`, and the live
   `~/.porcupine/agent/AGENTS.md` when prompts change. No code change ships
   without its docs.
3. **Checks must pass before commit** (from `Porcupine/`):
   ```bash
   npm run check   # biome, pinned-deps, ts-imports, shrinkwrap, install-lock, tsgo, browser-smoke
   ```
   `npm run check` is the gate. If it fails, it fails CI too — fix it locally.
4. **Tests for behavior changes.** Run the affected suites at minimum:
   ```bash
   npx vitest --run packages/<pkg>/test/<affected>.test.ts
   ```
   The full suite is slow — targeted is acceptable for small changes, but CI
   runs everything, so a broken adjacent suite blocks the merge.
5. **Rebuild before shipping.** `npm run build` after source changes — the
   published package and the local `dist/` must be fresh (stale `dist/` causes
   src-vs-dist type errors in the checks).

## Scope and naming rules

- All packages are `@porcupineai/*` (npm org: porcupineai). Never rename back
  to `@porcupine/*`.
- Generators and scripts hardcode the internal prefix — if the scope ever
  changes again, update `internalPackagePrefix` in
  `scripts/generate-coding-agent-{shrinkwrap,install-lock}.mjs`, `tsconfig.json`
  paths, locks, and all imports in one sweep.
- The CLI binary stays `porcupine`. Env vars stay `PORCUPINE_*`.

## The packaging flow (npm release)

The product ships as ONE npm package: `@porcupineai/porcupineai` — the whole
`Porcupine/` folder + README + LICENSE.

1. Build everything first: `npm run build` (fresh `dist/`).
2. Assemble the dump:
   ```bash
   rm -rf /tmp/pkg-build && mkdir -p /tmp/pkg-build/package
   rsync -a --exclude node_modules --exclude .venv --exclude __pycache__ \
     --exclude "*.pyc" --exclude "._*" --exclude .DS_Store --exclude .husky \
     --exclude benchmarks Porcupine/ /tmp/pkg-build/package/Porcupine/
   cp README.md LICENSE package.json /tmp/pkg-build/package/
   mkdir -p /tmp/pkg-build/package/node_modules
   cp -R node_modules/@porcupineai /tmp/pkg-build/package/node_modules/
   find /tmp/pkg-build -name "._*" -delete
   ```
3. Tar **files only** — the registry rejects directory entries (`E415 invalid
   path`):
   ```bash
   cd /tmp/pkg-build && find package \( -type f -o -type l \) | tar -czf /tmp/pkg.tgz -T -
   ```
4. Publish the tarball (token in `~/.npmrc-temp`, chmod 600):
   ```bash
   npm publish /tmp/pkg.tgz --userconfig=~/.npmrc-temp --access public
   ```
   The 31 external deps come from the registry; the `@porcupineai/*` internals
   are bundled in the tarball (`bundleDependencies`).
5. Verify end-to-end from the registry — install + boot:
   ```bash
   rm -rf /tmp/v && mkdir /tmp/v && npm install --prefix /tmp/v @porcupineai/porcupineai
   /tmp/v/node_modules/.bin/porcupine --version
   ```
   If the install looks short (fewer than ~250 packages), `npm cache clean
   --force` and retry — poisoned caches mimic broken packages.

Gotchas learned the hard way:
- npm cache poisoning (from failed postinstall runs) makes good packages look
  broken — clean cache first.
- `protobufjs`/`sharp`/`onnxruntime-node` postinstalls download binaries; they
  fail in sandboxed environments but work on normal machines.
- Publishing an already-published version → E403. Bump the version.
- A freshly-deleted/unpublished name is locked ~24h (`cannot be republished`).
  Use a different name or wait.

## The GitHub flow

- Public repo: `Abd0r/porcupineai`. Main is published via the orphan/single
  commit pattern; local history is shallow — full-history force-pushes fail on
  missing objects. Create a fresh orphan branch, `git add` the public paths
  (`README.md LICENSE CONTRIBUTING.md SECURITY.md .gitignore .npmignore
  package.json .github Porcupine`), commit, push `-f <branch>:main`.
- **Branch discipline:** the published branch and the dev branch drift — always
  apply a change ON the branch you're pushing from, then verify the live tree
  (`git show origin/main:<file>`), not just the working tree.
- Releases: `git tag -a vX.Y.Z -m ...` + `gh release create` with notes.
- CI must stay green (`build-check-test`): the check step runs biome with
  `--error-on-warnings` — warnings are failures.

## The self-improvement loop

Every change follows: **change → verify → measure → document → ship**.

1. **Change** — make the smallest honest change.
2. **Verify** — `npm run check` + targeted tests + `npm run build`.
3. **Measure** — where the change has a measurable effect (benchmarks, tests,
   learning evidence), record before/after. The learning system grades evidence
   A–D; D-grade never auto-applies.
4. **Document** — update docs, README, PROMPT, AGENTS (see non-negotiables #2).
5. **Ship** — commit with a conventional message, CI green, then release.

Autonomous learning complements this: `processPostTurnLearning` records
skill/tool usage into the evidence counter; snapshots + auto-rollback protect
against regressions (≥20% rate drop triggers rollback). When the refiner edits
a skill, it follows THIS same contract.

## Checklist before "done"

- [ ] No secrets, no internal dirs, no `._*` anywhere in the diff or tarball
- [ ] Docs updated for user-facing changes (README / docs / PROMPT / AGENTS)
- [ ] `npm run check` passes (exit 0)
- [ ] Targeted tests pass; no adjacent suite broken
- [ ] `npm run build` fresh
- [ ] npm packaging (if releasing): files-only tar, bundled internals, registry install verified
- [ ] Live GitHub tree verified (`git show origin/main:<file>`), not just local
