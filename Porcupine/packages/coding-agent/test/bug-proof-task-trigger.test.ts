/**
 * bug-proof-task-trigger.test.ts
 *
 * Proof-of-bug in src/porcupine/task-scheduler.ts — the script event trigger
 * has no change-detection/dedupe. `checkTrigger` for a script trigger fires
 * whenever `exitCode === trigger.exitCode`, and never compares `lastExitCode`.
 * So a task whose script keeps returning the expected exit code claims a new
 * run on EVERY idle-drain evaluation, even though nothing changed.
 *
 * Contrast: file triggers dedupe via `trigger.lastHash !== undefined &&
 * trigger.lastHash !== hash`. Script triggers do not.
 */
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PorcupineTaskStore } from "../src/porcupine/task-scheduler.ts";

let agentDir: string;

beforeEach(() => {
	agentDir = join(tmpdir(), `porcupine-bug-task-trigger-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
});

afterEach(() => {
	// best-effort cleanup
	try {
		import("node:fs").then((fs) => fs.rmSync(agentDir, { recursive: true, force: true }));
	} catch {
		/* ignore */
	}
});

function countRuns(store: PorcupineTaskStore, status: string): number {
	return store.listRuns().filter((r) => r.status === status).length;
}

describe("script event trigger dedupe (proof-of-bug)", () => {
	it("should claim at most one run when the script exits 0 on consecutive drains", () => {
		// `true` always exits 0 on every platform.
		const store = new PorcupineTaskStore(agentDir);
		store.createTask({
			title: "always-fire",
			prompt: "run me",
			trigger: { type: "script", command: "true", exitCode: 0 },
		});

		// First drain: the check exits 0 == expected -> claim a run.
		const first = store.claimEventTriggeredRuns();
		expect(first.length).toBe(1);

		// Second drain: nothing changed, but a script trigger re-fires because
		// checkTrigger never compares lastExitCode. This is the bug.
		const second = store.claimEventTriggeredRuns();
		expect(second.length).toBe(0);
	});

	it("script trigger keeps claiming runs on every evaluation (no lastExitCode guard)", () => {
		const store = new PorcupineTaskStore(agentDir);
		store.createTask({
			title: "always-fire",
			prompt: "run me",
			trigger: { type: "script", command: "true", exitCode: 0 },
		});

		for (let i = 0; i < 5; i++) {
			store.claimEventTriggeredRuns();
		}

		// File triggers stop after the first claim (dedupe by hash).
		// Script triggers should behave the same — only 1 claimed run ever.
		const claimed = countRuns(store, "claimed");
		expect(claimed).toBe(1);
	});
});
