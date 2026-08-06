export type ReasoningVisibilityCommand =
	| { kind: "status" }
	| { kind: "set"; hide: boolean }
	| { kind: "invalid"; message: string };

/**
 * Parse the explicit reasoning-visibility command without conflating it with
 * /reasoning, which selects a model's reasoning effort.
 */
export function parseReasoningVisibilityCommand(text: string): ReasoningVisibilityCommand | null {
	const match = /^\/reasoning-show(?:\s+(.*))?\s*$/i.exec(text.trim());
	if (!match) return null;

	const value = match[1]?.trim().toLowerCase();
	if (!value) return { kind: "status" };
	if (value === "yes") return { kind: "set", hide: false };
	if (value === "no") return { kind: "set", hide: true };
	return { kind: "invalid", message: "Usage: /reasoning-show [yes|no]" };
}
