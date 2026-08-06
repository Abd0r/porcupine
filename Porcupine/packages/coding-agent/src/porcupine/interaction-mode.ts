export type InteractionMode = "ask" | "normal" | "auto";

/**
 * @deprecated Prefer AgentSession.interactionMode — the session is the source of truth.
 * These Maps remain only as a thin fallback for tests / legacy call sites.
 */
const sessionModes = new Map<string, InteractionMode>();

export function getSessionInteractionMode(sessionKey: string): InteractionMode {
	return sessionModes.get(sessionKey) ?? "normal";
}

export function setSessionInteractionMode(sessionKey: string, mode: InteractionMode): InteractionMode {
	sessionModes.set(sessionKey, mode);
	return mode;
}

export function isAskMode(sessionKey: string): boolean {
	return getSessionInteractionMode(sessionKey) === "ask";
}

export function isAutoInteractionMode(sessionKey: string): boolean {
	return getSessionInteractionMode(sessionKey) === "auto";
}

/** Canonical compact badge used anywhere a single interaction mode is shown. */
export function formatInteractionModeBadge(mode: InteractionMode): string {
	switch (mode) {
		case "ask":
			return "✋ Ask";
		case "normal":
			return "🛡️  Normal";
		case "auto":
			return "⚡ Auto";
	}
}

export function formatInteractionMode(mode: InteractionMode): string {
	switch (mode) {
		case "ask":
			return "Ask: confirm every command and file edit.";
		case "normal":
			return "Normal: safe commands and all file edits run directly; flagged commands ask.";
		case "auto":
			return "Auto: safe commands and edits run directly; flagged commands use the LLM safety gate.";
	}
}
