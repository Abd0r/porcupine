import { diffLines } from "diff";

export type ArtifactOperation = "created" | "updated" | "deleted";

export interface ArtifactChange {
	path: string;
	operation: ArtifactOperation;
	linesAdded: number;
	linesRemoved: number;
	additions: string[];
	removals: string[];
	summary?: string;
}

function contentLines(value: string): string[] {
	return value
		.replace(/\r\n/g, "\n")
		.split("\n")
		.filter((line) => line.length > 0);
}

export function describeArtifactChange(
	path: string,
	previousContent: string,
	nextContent: string,
	summary?: string,
): ArtifactChange {
	let linesAdded = 0;
	let linesRemoved = 0;
	const additions: string[] = [];
	const removals: string[] = [];

	for (const change of diffLines(previousContent, nextContent)) {
		if (change.added) {
			linesAdded += change.count ?? 0;
			additions.push(...contentLines(change.value));
		}
		if (change.removed) {
			linesRemoved += change.count ?? 0;
			removals.push(...contentLines(change.value));
		}
	}

	const operation: ArtifactOperation =
		previousContent.length === 0 ? "created" : nextContent.length === 0 ? "deleted" : "updated";
	return { path, operation, linesAdded, linesRemoved, additions, removals, summary };
}

function lineLabel(count: number): string {
	return count === 1 ? "line" : "lines";
}

export function formatArtifactChange(change: ArtifactChange): string {
	const lines = [`${change.path} ${change.operation}`];
	if (change.linesAdded > 0) lines.push(`+ Added ${change.linesAdded} ${lineLabel(change.linesAdded)}`);
	if (change.linesRemoved > 0) lines.push(`- Removed ${change.linesRemoved} ${lineLabel(change.linesRemoved)}`);
	for (const addition of change.additions) lines.push(`  ${addition}`);
	return lines.join("\n");
}
