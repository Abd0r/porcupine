/**
 * Stock-file sync — keeps the shipped agent-home files (PROMPT.md, AGENTS.md,
 * PERSONALITY.md, SYSTEM.md, APPEND_SYSTEM.md) in `~/.porcupine/agent/` in
 * sync with the package's `agent-home/` copies, WITHOUT clobbering user edits.
 *
 * Each synced file records the hash of the stock content it was last synced
 * from. A dest file whose hash still matches that record is untouched by the
 * user and safe to update; a dest file that differs is a user edit and is
 * skipped (reported), unless `--force` is passed.
 *
 * Exposed as `porcupine sync` and referenced by `/update`.
 */

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getPackageDir } from "../config.ts";

interface SyncState {
	/** fileName → hash of the stock content it was last synced from. */
	[fileName: string]: string;
}

export interface SyncReport {
	added: string[];
	updated: string[];
	skipped: string[];
	forced: string[];
}

export function stockAgentHomeDir(): string {
	return join(getPackageDir(), "agent-home");
}

function defaultStatePath(): string {
	// Overridable so tests (and power users) can isolate or disable state.
	const override = process.env.PORCUPINE_SYNC_STATE_PATH;
	if (override) return override;
	return join(homedir(), ".porcupine", "agent", "agent-home-sync.json");
}

function readState(statePath: string): SyncState {
	try {
		if (!existsSync(statePath)) return {};
		return JSON.parse(readFileSync(statePath, "utf8")) as SyncState;
	} catch {
		return {};
	}
}

function writeState(statePath: string, state: SyncState): void {
	try {
		writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
	} catch {
		// never fail a sync because state could not be persisted
	}
}

function sha256(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

/**
 * Sync the shipped `agent-home/` files into the user agent dir.
 * Returns a report of added / updated / skipped / forced files.
 */
export function syncStockAgentFiles(
	options: {
		force?: boolean;
		sourceDir?: string;
		destDir?: string;
		/** Override the sync-state file location (tests / isolation). */
		stateFile?: string;
	} = {},
): SyncReport {
	const sourceDir = options.sourceDir ?? stockAgentHomeDir();
	const destDir = options.destDir ?? join(homedir(), ".porcupine", "agent");
	const statePath = options.stateFile ?? defaultStatePath();
	const report: SyncReport = { added: [], updated: [], skipped: [], forced: [] };

	if (!existsSync(sourceDir)) {
		return report;
	}

	const state = readState(statePath);
	mkdirSync(destDir, { recursive: true });
	mkdirSync(join(statePath, ".."), { recursive: true });

	for (const fileName of readdirSync(sourceDir)) {
		const sourcePath = join(sourceDir, fileName);
		const destPath = join(destDir, fileName);
		let stockContent: string;
		try {
			stockContent = readFileSync(sourcePath, "utf8");
		} catch {
			continue; // directories or unreadable files are not synced
		}
		const stockHash = sha256(stockContent);
		const lastSynced = state[fileName];

		if (!existsSync(destPath)) {
			copyFileSync(sourcePath, destPath);
			state[fileName] = stockHash;
			report.added.push(fileName);
			continue;
		}

		let destHash: string;
		try {
			destHash = sha256(readFileSync(destPath, "utf8"));
		} catch {
			report.skipped.push(fileName);
			continue;
		}

		if (destHash === stockHash) {
			// already in sync (or identical on first run) — just record it.
			state[fileName] = stockHash;
			continue;
		}

		if (options.force) {
			copyFileSync(sourcePath, destPath);
			state[fileName] = stockHash;
			report.forced.push(fileName);
			continue;
		}

		if (lastSynced && destHash === lastSynced) {
			// untouched since our last sync → safe to update to the new stock.
			copyFileSync(sourcePath, destPath);
			state[fileName] = stockHash;
			report.updated.push(fileName);
			continue;
		}

		// lastSynced is missing (first run) or the user edited the file → skip.
		report.skipped.push(fileName);
	}

	writeState(statePath, state);
	return report;
}
