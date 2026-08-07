/**
 * /memory — show what the agent has stored about the user (USER.md), about the
 * environment (MEMORY.md), and recent autonomous learning evidence.
 *
 * Read-only by design: listing what Porcupine remembers is always safe. Any/
 * applying or rejecting a learning record is left to the dedicated /learning
 * (graph|history) flow, which owns that lifecycle.
 */

import { listLearningProposals } from "./learning-store.ts";
import { defaultContent, ensureMemoryFiles, listEntries, memoryPath, readMemoryFile } from "./memory-store.ts";

export type MemoryCommand = { kind: "show" } | { kind: "invalid"; message: string };

export function parseMemoryCommand(text: string): MemoryCommand | null {
	const match = /^\/memory(?:\s+.*)?\s*$/i.exec(text.trim());
	if (!match) return null;
	// Any trailing words are tolerated but ignored — /memory is purely a viewer.
	return { kind: "show" };
}

export interface MemoryReport {
	userPath: string;
	memoryPath: string;
	userEntries: string[];
	memoryEntries: string[];
	learningEntries: Array<{ id: string; status: string; kind: string; summary: string }>;
}

/** Read-only snapshot of everything Porcupine has stored for this session. */
export function buildMemoryReport(agentDir: string): MemoryReport {
	ensureMemoryFiles(agentDir);
	return {
		userPath: memoryPath(agentDir, "user"),
		memoryPath: memoryPath(agentDir, "memory"),
		userEntries: listEntries(readMemoryFile(agentDir, "user"))
			.filter((entry) => !defaultBoilerplate("user").includes(entry.text))
			.map((entry) => entry.text),
		memoryEntries: listEntries(readMemoryFile(agentDir, "memory"))
			.filter((entry) => !defaultBoilerplate("memory").includes(entry.text))
			.map((entry) => entry.text),
		learningEntries: listLearningProposals(agentDir).map((proposal) => ({
			id: proposal.id,
			status: proposal.status,
			kind: proposal.kind,
			summary: proposal.summary,
		})),
	};
}

const VIEW_LIMIT = 12;

/** Default boilerplate lines (stripped of their "- ") from an untouched file. */
function defaultBoilerplate(target: "user" | "memory"): string[] {
	return listEntries(defaultContent(target)).map((entry) => entry.text);
}

/** Render the report as a compact chat block (statuses when the store exposes them). */
export function formatMemoryReport(agentDir: string): string {
	const report = buildMemoryReport(agentDir);
	const lines: string[] = [];

	lines.push("Memory");
	lines.push("");
	lines.push(`USER.md (about you): ${report.userPath}`);
	if (report.userEntries.length === 0) {
		lines.push("  (nothing stored yet)");
	} else {
		lines.push(...report.userEntries.map((text) => `  - ${text}`));
	}

	lines.push("");
	lines.push(`MEMORY.md (agent environment notes): ${report.memoryPath}`);
	if (report.memoryEntries.length === 0) {
		lines.push("  (nothing stored yet)");
	} else {
		lines.push(...report.memoryEntries.map((text) => `  - ${text}`));
	}

	lines.push("");
	lines.push(`Learning evidence (${report.learningEntries.length} records):`);
	if (report.learningEntries.length === 0) {
		lines.push("  (none, no autonomous improvements recorded yet)");
	} else {
		for (const entry of report.learningEntries.slice(0, VIEW_LIMIT)) {
			lines.push(`  - [${entry.status}] [${entry.kind}] ${entry.summary} (${entry.id})`);
		}
		if (report.learningEntries.length > VIEW_LIMIT) {
			lines.push(`  - ... ${report.learningEntries.length - VIEW_LIMIT} more`);
		}
	}
	lines.push("", "This is read-only. Reject or apply a specific learning record via /learning.");

	return lines.join("\n");
}
