---
name: customization-recovery
description: Recover safely from broken Porcupine customizations.
stack: meta
---

# Customization Recovery

Use this playbook when Porcupine stops starting, behaves incorrectly, or breaks after a settings, extension, skill, prompt, theme, project-resource, model, or source customization. It identifies the failing layer, preserves the user's work, and verifies a minimal repair. It does not delete customizations, reset credentials, or reinstall software without explicit user approval.

## When to use

- The agent fails during startup or after `/reload`.
- A newly added extension, skill, prompt, theme, package, or context file changed behavior.
- One project fails while other directories work.
- A custom provider/model setting is unusable.
- The source checkout fails after a local modification.

## Recovery invariant

1. Preserve before changing: create a timestamped backup of each non-secret file to be edited.
2. Disable one layer at a time with a real Porcupine flag.
3. Use reversible quarantine such as `.disabled`; do not delete.
4. Never read, print, move, reset, or replace credential/auth files.
5. Verify the original failing command, not merely a recovery command.

## Procedure

### 1. Establish a known-good recovery session

Use `bash` to run:

```bash
porcupine --no-extensions --no-skills --no-prompt-templates --no-themes --no-context-files --no-session
```

For a suspicious project, add `--no-approve`. This matters because project trust does not prevent `AGENTS.md` and `CLAUDE.md` from loading; `--no-context-files` does.

Keep built-in tools enabled. Do not use `--no-tools` unless a built-in tool itself is known to be the failure.

### 2. Identify the resource layer

Compare the original launch to recovery variants:

- `--no-extensions`: extension or package extension.
- `--no-skills --no-prompt-templates`: skill frontmatter/body or prompt resource.
- `--no-themes`: custom theme.
- `--no-context-files --no-approve`: project settings, resource directories, or context instructions.
- `--provider <provider> --model <model>`: saved provider/model selection.
- `--no-session`: corrupt or problematic session.

Do not infer the layer from timing alone. A flag must make a reproducible difference.

### 3. Back up before repair

Settings are at `~/.porcupine/agent/settings.json` globally and `.porcupine/settings.json` per project. Use `bash` to create a private timestamped backup directory, then copy only the affected settings/resource file. Do not include auth or credential files.

Validate a settings file before editing it:

```bash
python3 -m json.tool <settings-file> >/dev/null
```

### 4. Repair minimally

- Invalid JSON: correct only the syntax or quarantine that one settings file.
- Broken extension/skill/theme: rename only the suspected file to `.disabled`, then re-enable resources one by one.
- Project-specific breakage: repair only project resources, not global settings.
- Invalid model: prove a one-run `--provider` / `--model` override first, then update saved settings if the user wants it.
- Source modification: inspect `git status --short`, `git diff --check`, run the focused test, and preserve the diff. Never run a destructive git command without approval.

### 5. Verify and report

Run the original command. For source edits, run `npm run build` and focused tests. Report:

- exact root cause backed by the failing/successful command pair;
- files backed up and any file left quarantined;
- exact fix;
- verification output;
- remaining limitation, if any.

## Quick reference

| Purpose | Command/flag |
|---|---|
| Disable discovered extensions | `--no-extensions` / `-ne` |
| Disable discovered skills | `--no-skills` / `-ns` |
| Disable prompt templates | `--no-prompt-templates` / `-np` |
| Disable themes | `--no-themes` |
| Disable AGENTS/CLAUDE context | `--no-context-files` / `-nc` |
| Ignore project-local resources | `--no-approve` / `-na` |
| Isolate session state | `--no-session` |
| Override saved model | `--provider <name> --model <id>` |

## Verification

A repair is complete only if normal startup succeeds without recovery flags, the affected resource is either working or explicitly quarantined, and no credential or unrelated customization changed.

## Cross-references

- Human-readable runbook: `docs/customization-recovery.md` in the Porcupine checkout.
- Extension resource rules: `docs/extensions.md`.
- Project-resource isolation and trust: `docs/security.md` and `docs/settings.md`.
