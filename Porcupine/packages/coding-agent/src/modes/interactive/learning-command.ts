export type LearningCommand =
	| { kind: "graph" }
	| { kind: "history" }
	| { kind: "feed" }
	| { kind: "invalid"; message: string };

const USAGE = "Usage: /learning [graph|history|feed]";

export function parseLearningCommand(text: string): LearningCommand | null {
	const match = /^\/learning(?:\s+(.*))?\s*$/i.exec(text.trim());
	if (!match) return null;
	const args = match[1]?.trim().split(/\s+/).filter(Boolean) ?? [];
	if (!args.length || args[0] === "graph" || args[0] === "status") return { kind: "graph" };
	if ((args[0] === "history" || args[0] === "review") && args.length === 1) return { kind: "history" };
	if ((args[0] === "feed" || args[0] === "activity") && args.length === 1) return { kind: "feed" };
	return { kind: "invalid", message: USAGE };
}
