---
name: source-driven-development
description: Verify framework APIs against official sources first.
stack: coding
---

# Source-Driven Development

Use current primary sources for framework-, library-, provider-, and platform-specific code. Do not write version-sensitive code from recall when the repository or official documentation can settle it.

## When to Use

- Adding or changing code that uses a framework, SDK, provider, or external API.
- A dependency version, signature, deprecation, compatibility rule, or security behavior affects the design.
- Existing code and current official guidance appear to disagree.

Do not use this for purely local refactors, spelling fixes, or version-independent logic.

## Procedure

1. Inspect the repository manifest and lockfile with `read` to identify exact dependencies and versions.
2. Inspect neighbouring code and tests with `grep` and `read`; project conventions are evidence too.
3. Search only for the precise API or migration question with `web_search`.
4. Read the official documentation, release note, API reference, or source repository with `web_extract`. Prefer the project’s own domain and release notes over tutorials.
5. Implement the documented pattern with `edit` or `write`.
6. Run the repository’s smallest relevant test/build command through `bash`.
7. State the source URL and any unresolved version ambiguity in the final report.

## Decision Rules

- Official API docs > official changelog/migration guide > source code > maintainer material > third-party tutorial.
- If current documentation conflicts with established project convention, preserve compatibility by default and flag the conflict rather than silently modernizing unrelated code.
- If no authoritative source exists, label the implementation as unverified. Do not manufacture API names or signatures.

## Pitfalls

- Searching a framework homepage instead of the exact method, component, or migration.
- Copying examples written for another major version.
- Treating a blog or generated answer as an authoritative source.
- Adding a dependency because it appears in a tutorial without checking the existing stack.

## Verification

- Dependency/version was read from the repo.
- A primary source was checked for version-sensitive behavior.
- The implementation and focused verification command completed successfully, or the blocker is reported plainly.
