export type RefreshCommand = { kind: "reload" } | { kind: "invalid"; message: string };

const USAGE = "Usage: /refresh [skill|all]";

/**
 * `/refresh` rebuilds the complete Porcupine runtime and resumes the active
 * session from disk. Bare `/refresh`, `/refresh skill`, and `/refresh all` are
 * equivalent: skills can reference extensions, prompts, tools, and context, so
 * partial reloads would leave the session inconsistent.
 */
export function parseRefreshCommand(text: string): RefreshCommand | null {
	const match = /^\/refresh(?:\s+(.*))?\s*$/i.exec(text.trim());
	if (!match) return null;
	const target = match[1]?.trim().toLowerCase();
	if (!target || target === "skill" || target === "skills" || target === "all") {
		return { kind: "reload" };
	}
	return { kind: "invalid", message: USAGE };
}
