import type { ArtifactChange } from "@porcupineai/agent-core";
import { Text } from "@porcupineai/tui";
import { theme } from "../theme/theme.ts";

const COMPACT_PREVIEW_LINES = 3;

function lineLabel(count: number): string {
	return count === 1 ? "line" : "lines";
}

export class ArtifactChangeComponent extends Text {
	private readonly change: ArtifactChange;
	private expanded = false;

	constructor(change: ArtifactChange) {
		super("", 1, 0);
		this.change = change;
		this.updateDisplay();
	}

	setExpanded(expanded: boolean): void {
		if (this.expanded === expanded) return;
		this.expanded = expanded;
		this.updateDisplay();
	}

	private updateDisplay(): void {
		const lines = [theme.fg("accent", theme.bold(`${this.change.path} ${this.change.operation}`))];
		if (this.change.summary) {
			lines.push(theme.fg("dim", this.change.summary));
		}
		if (this.change.linesAdded > 0) {
			lines.push(theme.fg("success", `+ Added ${this.change.linesAdded} ${lineLabel(this.change.linesAdded)}`));
		}
		if (this.change.linesRemoved > 0) {
			lines.push(theme.fg("error", `- Removed ${this.change.linesRemoved} ${lineLabel(this.change.linesRemoved)}`));
		}

		const previews = [
			...this.change.removals.map((line) => theme.fg("toolDiffRemoved", `- ${line}`)),
			...this.change.additions.map((line) => theme.fg("toolDiffAdded", `+ ${line}`)),
		];
		const visiblePreviews = this.expanded ? previews : previews.slice(0, COMPACT_PREVIEW_LINES);
		lines.push(...visiblePreviews);

		const hiddenCount = previews.length - visiblePreviews.length;
		if (hiddenCount > 0) {
			lines.push(theme.fg("dim", `  ${hiddenCount} more changed ${lineLabel(hiddenCount)}`));
		}
		this.setText(lines.join("\n"));
	}
}
