import { Text } from "@porcupineai/tui";
import type { TaskGraphStepStatus, TaskGraphView } from "../../../porcupine/session-orchestrator.ts";
import { theme } from "../theme/theme.ts";

function statusGlyph(status: TaskGraphStepStatus): string {
	switch (status) {
		case "pending":
			return "○";
		case "active":
			return "●";
		case "done":
			return "✓";
		case "failed":
			return "✗";
		case "skipped":
			return "–";
		default: {
			const _exhaustive: never = status;
			return _exhaustive;
		}
	}
}

function statusColor(status: TaskGraphStepStatus, text: string): string {
	switch (status) {
		case "active":
			return theme.fg("accent", text);
		case "done":
			return theme.fg("success", text);
		case "failed":
			return theme.fg("error", text);
		case "skipped":
			return theme.fg("dim", text);
		default:
			return theme.fg("muted", text);
	}
}

/**
 * Compact live task graph for Porcupine plan steps.
 * Example:
 *   🧭 Plan  ready
 *     ● use-edit-2  Apply edit to file
 *     ○ use-bash-3  Run tests
 */
export class TaskGraphComponent extends Text {
	private graph: TaskGraphView;

	constructor(graph?: TaskGraphView) {
		super("", 1, 0);
		this.graph = graph ?? { objective: "", status: "idle", steps: [], routeSummary: [] };
		this.updateDisplay();
	}

	setGraph(graph: TaskGraphView): void {
		this.graph = graph;
		this.updateDisplay();
	}

	private updateDisplay(): void {
		if (this.graph.status === "idle" || (this.graph.steps.length === 0 && !this.graph.objective)) {
			this.setText("");
			return;
		}

		const header = theme.fg(
			"accent",
			theme.bold(`🧭 Plan  ${this.graph.status}${this.graph.objective ? ` — ${this.graph.objective}` : ""}`),
		);
		const lines = [header];

		if (this.graph.routeSummary.length > 0) {
			lines.push(theme.fg("dim", `   route: ${this.graph.routeSummary.slice(0, 6).join(", ")}`));
		}

		for (const step of this.graph.steps) {
			const glyph = statusGlyph(step.status);
			const label = `${glyph} ${step.id}  ${step.objective}`;
			lines.push(`   ${statusColor(step.status, label)}`);
		}

		if (this.graph.status === "blocked") {
			lines.push(theme.fg("warning", "   blocked — continuing with best-effort tools"));
		}

		this.setText(lines.join("\n"));
	}
}
