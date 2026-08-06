/**
 * Evidence counter — per-skill trailing success/failure statistics.
 *
 * Feeds the self-improvement evaluation loop: when a learned or refined skill
 * is used, the session records the outcome here. The auto-rollback check in
 * learning-store.ts compares the trailing success rate against the baseline
 * captured at edit time and reverts an edit that regresses.
 *
 * Storage: `~/.porcupine/agent/learning/evidence-counter.json` (single file,
 * atomic writes — consistent with learning-store.ts).
 */

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const EVIDENCE_COUNTER_FILE = "evidence-counter.json";
/** Trailing window: only the last N uses are considered for rollback checks. */
export const EVIDENCE_WINDOW = 20;
/** A success-rate drop at or above this magnitude triggers auto-rollback. */
export const ROLLBACK_RATE_THRESHOLD = 0.2;
/** Two or more consecutive errors attributable to a skill also trigger rollback. */
export const ROLLBACK_CONSECUTIVE_ERRORS = 2;

export interface SkillUseRecord {
	at: string;
	ok: boolean;
}

export interface SkillStats {
	uses: number;
	successes: number;
	failures: number;
	/** Trailing window of outcomes (newest last), capped at EVIDENCE_WINDOW. */
	window: SkillUseRecord[];
}

export interface EvidenceCounterData {
	skills: Record<string, SkillStats>;
}

function counterPath(agentDir: string): string {
	return join(agentDir, "learning", EVIDENCE_COUNTER_FILE);
}

function readCounter(agentDir: string): EvidenceCounterData {
	try {
		const parsed = JSON.parse(readFileSync(counterPath(agentDir), "utf8")) as EvidenceCounterData;
		if (parsed && typeof parsed.skills === "object") return parsed;
	} catch {
		// Missing or corrupt — start fresh.
	}
	return { skills: {} };
}

function writeCounter(agentDir: string, data: EvidenceCounterData): void {
	const path = counterPath(agentDir);
	mkdirSync(dirname(path), { recursive: true });
	const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
	try {
		writeFileSync(temporary, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 });
		renameSync(temporary, path);
	} finally {
		try {
			rmSync(temporary, { force: true });
		} catch {
			// Best-effort cleanup; the atomic rename already completed when it matters.
		}
	}
}

/** Record one use of a skill (or learned capability) with its outcome. */
export function recordSkillUse(agentDir: string, skillId: string, ok: boolean): void {
	const data = readCounter(agentDir);
	const stats = data.skills[skillId] ?? { uses: 0, successes: 0, failures: 0, window: [] };
	stats.uses += 1;
	if (ok) stats.successes += 1;
	else stats.failures += 1;
	stats.window.push({ at: new Date().toISOString(), ok });
	if (stats.window.length > EVIDENCE_WINDOW) stats.window.splice(0, stats.window.length - EVIDENCE_WINDOW);
	data.skills[skillId] = stats;
	writeCounter(agentDir, data);
}

/** Raw stats for one skill (undefined when never used). */
export function getSkillStats(agentDir: string, skillId: string): SkillStats | undefined {
	return readCounter(agentDir).skills[skillId];
}

/** All recorded skill stats (for /learning status and the feed). */
export function getAllSkillStats(agentDir: string): Record<string, SkillStats> {
	return readCounter(agentDir).skills;
}

/** Trailing success rate over the window (0.0–1.0); NaN when no uses. */
export function skillSuccessRate(agentDir: string, skillId: string): number | undefined {
	const stats = getSkillStats(agentDir, skillId);
	if (!stats || stats.uses === 0) return undefined;
	return stats.successes / stats.uses;
}

/** Trailing success rate over the LAST N uses (rolling). */
export function trailingSuccessRate(
	agentDir: string,
	skillId: string,
	windowSize = EVIDENCE_WINDOW,
): number | undefined {
	const stats = getSkillStats(agentDir, skillId);
	if (!stats || stats.window.length === 0) return undefined;
	const tail = stats.window.slice(-windowSize);
	const ok = tail.filter((record) => record.ok).length;
	return ok / tail.length;
}

export interface RollbackCheck {
	shouldRollback: boolean;
	reasons: string[];
	currentRate?: number;
	baselineRate?: number;
}

/**
 * Decide whether a refined artifact should be auto-rolled back.
 * Triggers: trailing success rate dropped at least ROLLBACK_RATE_THRESHOLD
 * below the baseline captured at edit time, or ROLLBACK_CONSECUTIVE_ERRORS
 * consecutive failures in the window.
 */
export function checkRollback(agentDir: string, skillId: string, baselineRate?: number): RollbackCheck {
	const reasons: string[] = [];
	const stats = getSkillStats(agentDir, skillId);
	if (!stats || stats.window.length === 0) return { shouldRollback: false, reasons };

	const currentRate = trailingSuccessRate(agentDir, skillId);
	let consecutiveErrors = 0;
	for (let i = stats.window.length - 1; i >= 0; i--) {
		if (!stats.window[i]!.ok) consecutiveErrors += 1;
		else break;
	}

	if (
		baselineRate !== undefined &&
		currentRate !== undefined &&
		baselineRate - currentRate >= ROLLBACK_RATE_THRESHOLD
	) {
		reasons.push(
			`success rate dropped ${(baselineRate * 100).toFixed(0)}% -> ${(currentRate * 100).toFixed(0)}% vs baseline`,
		);
	}
	if (consecutiveErrors >= ROLLBACK_CONSECUTIVE_ERRORS) {
		reasons.push(`${consecutiveErrors} consecutive failures after the edit`);
	}

	return { shouldRollback: reasons.length > 0, reasons, currentRate, baselineRate };
}
