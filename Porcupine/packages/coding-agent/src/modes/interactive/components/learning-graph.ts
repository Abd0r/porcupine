import { Text } from "@porcupineai/tui";
import type {
	LearningEvent,
	LearningFeedEntry,
	LearningGraph,
	LearningProposal,
} from "../../../porcupine/learning-store.ts";
import { theme } from "../theme/theme.ts";

function nodeGlyph(record: LearningProposal): string {
	switch (record.status) {
		case "activated":
			return "●";
		case "archived":
			return "◌";
		case "rejected":
			return "✗";
		default:
			return "○";
	}
}

function nodeColor(record: LearningProposal, text: string): string {
	switch (record.status) {
		case "activated":
			return theme.fg("success", text);
		case "archived":
			return theme.fg("warning", text);
		case "rejected":
			return theme.fg("error", text);
		default:
			return theme.fg("muted", text);
	}
}

function formatSince(timestamp?: string): string {
	if (!timestamp) return "no learning events yet";
	const date = new Date(timestamp);
	return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString();
}

/**
 * Append-only audit trail for `/learning history`. Shows what the learning
 * system actually recorded, newest first — not a synthetic scoreboard.
 */
export class LearningHistoryComponent extends Text {
	constructor(events: LearningEvent[]) {
		super("", 1, 0);
		this.setText(this.renderHistory(events));
	}

	private renderHistory(events: LearningEvent[]): string {
		const header = theme.fg("accent", theme.bold(`🧠 Learning History  ${events.length} recent events`));
		const lines = [header];
		if (!events.length) {
			lines.push(theme.fg("muted", "   └─ no learning events recorded yet"));
			return lines.join("\n");
		}
		for (const event of events) {
			const when = new Date(event.at);
			const time = Number.isNaN(when.getTime()) ? event.at : when.toLocaleTimeString();
			const detail = event.recordId ? ` — ${event.recordId}${event.kind ? ` [${event.kind}]` : ""}` : "";
			lines.push(theme.fg("dim", `   ${time}  ${event.type}${detail}`));
		}
		return lines.join("\n");
	}
}

/**
 * Evidence graph for autonomous learning. It represents persisted artifacts,
 * not invented capability scores.
 */
export class LearningGraphComponent extends Text {
	constructor(graph: LearningGraph) {
		super("", 1, 0);
		this.setText(this.renderGraph(graph));
	}

	private renderGraph(graph: LearningGraph): string {
		const header = theme.fg(
			"accent",
			theme.bold(`🧠 Autonomous Learning  ${graph.activatedRecords}/${graph.totalRecords} activated`),
		);
		const lines = [header, theme.fg("dim", `   since: ${formatSince(graph.startedAt)}`)];
		lines.push(theme.fg("dim", `   profile updates: ${graph.userPatternUpdates}  ·  persisted evidence only`));

		if (!graph.nodes.length) {
			lines.push(theme.fg("muted", "   └─ no durable improvements recorded yet"));
			return lines.join("\n");
		}

		const byKind = new Map<string, LearningProposal[]>();
		for (const node of graph.nodes) {
			const nodes = byKind.get(node.kind) ?? [];
			nodes.push(node);
			byKind.set(node.kind, nodes);
		}
		const labels: Record<string, string> = {
			memory: "Memory",
			skill: "Skills",
			tool: "Tools (manual review only)",
		};
		const groups = [...byKind.entries()];
		for (const [groupIndex, [kind, nodes]] of groups.entries()) {
			const isLastGroup = groupIndex === groups.length - 1;
			const branch = isLastGroup ? "└─" : "├─";
			lines.push(theme.fg("accent", `   ${branch} ${labels[kind] ?? kind}`));
			for (const [index, node] of nodes.slice(0, 8).entries()) {
				const isLastNode = index === Math.min(nodes.length, 8) - 1;
				const stem = isLastGroup ? "      " : "   │  ";
				const nodeBranch = isLastNode ? "└─" : "├─";
				const label = `${nodeGlyph(node)} ${node.id} — ${node.summary}`;
				lines.push(`${stem}${nodeColor(node, `${nodeBranch} ${label}`)}`);
			}
			if (nodes.length > 8) {
				lines.push(theme.fg("dim", `      └─ … ${nodes.length - 8} more`));
			}
		}
		return lines.join("\n");
	}
}

/**
 * `/learning feed` — the self-improvement activity feed: every autonomous
 * change the agent made to its skills/tools/memory, newest first, with the
 * line counts the user asked to see ("how much it added, what it added").
 */
export class LearningFeedComponent extends Text {
	constructor(entries: LearningFeedEntry[]) {
		super("", 1, 0);
		this.setText(this.renderFeed(entries));
	}

	private renderFeed(entries: LearningFeedEntry[]): string {
		if (entries.length === 0) {
			return theme.fg("muted", "🧠 Learning feed: no self-improvements recorded yet.");
		}
		const lines = [theme.fg("accent", theme.bold("🧠 Self-improvement feed (newest first)"))];
		for (const entry of entries) {
			const when = formatSince(entry.at);
			const delta = `${numberOrDash(entry.linesAdded)}+${numberOrDash(entry.linesRemoved)}−`;
			const actionColor =
				entry.action === "rolled-back"
					? theme.fg("warning", `↺ ${entry.action}`)
					: entry.action === "rejected"
						? theme.fg("error", `✗ ${entry.action}`)
						: theme.fg("success", `✓ ${entry.action}`);
			const file = entry.file ? theme.fg("dim", entry.file) : "";
			lines.push(`  ${actionColor} ${delta.padEnd(8)} ${file} ${entry.summary}`);
			lines.push(theme.fg("dim", `     ${when}`));
		}
		return lines.join("\n");
	}
}

function numberOrDash(value: number | undefined): string {
	return value === undefined ? "?" : String(value);
}
