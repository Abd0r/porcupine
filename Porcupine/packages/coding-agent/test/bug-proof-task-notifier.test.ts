/**
 * bug-proof-task-notifier.test.ts
 *
 * Proof-of-bug in src/porcupine/task-scheduler.ts: `finishRun` invokes the
 * taskRunResultNotifier callback INSIDE the lock-protected `mutate()` operation
 * (i.e. on the store's save path). A throwing notifier aborts the persistence of
 * the terminal state — `save()` is never reached — so the run stays "running"
 * on disk while only this in-memory copy is updated. The comment in the code
 * claims the notifier is "kept out of the store's save path: fire-and-forget",
 * but it is actually called synchronously before the mutation is persisted.
 */
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PorcupineTaskStore } from "../src/porcupine/task-scheduler.ts";

let agentDir: string;
let path: string;

beforeEach(() => {
	agentDir = join(tmpdir(), `porcupine-bug-notifier-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
	path = join(agentDir, "tasks", "tasks.json");
});

afterEach(() => {
	import("node:fs").then((fs) => fs.rmSync(agentDir, { recursive: true, force: true })).catch(() => {});
});

describe("task notifier on the save path (proof-of-bug)", () => {
	it("a throwing notifier should not prevent the run terminal state from persisting", () => {
		const store = new PorcupineTaskStore(agentDir);
		const task = store.createTask({ title: "t", prompt: "p" });
		const run = store.startRun(task.id, { type: "manual" });

		// Register a notifier that throws. This must not lose the persisted update.
		store.setTaskRunResultNotifier(() => {
			throw new Error("bridge send exploded");
		});

		// Expected: completeRun persists the run as completed. The notifier's throw
		// must be swallowed (fire-and-forget) rather than aborting the persisting
		// terminal state or propagating back to the caller.
		let threw: string | undefined;
		try {
			store.completeRun(run.id, "ok");
		} catch (error) {
			threw = error instanceof Error ? error.message : String(error);
		}
		expect(threw).toBeUndefined();

		// The bug: because the notifier throws inside mutate(), save() is skipped
		// and the on-disk run remains "running".
		const persisted = JSON.parse(readFileSync(path, "utf8")) as { runs: Array<{ id?: string; status?: string }> };
		const persistedRun = persisted.runs.find((r) => r.id === run.id);
		expect(persistedRun?.status).toBe("completed");
	});
});
