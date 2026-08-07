import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PorcupineTaskStore } from "../src/porcupine/task-scheduler.ts";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function createStore(): PorcupineTaskStore {
	const root = mkdtempSync(join(tmpdir(), "porcupine-events-chain-"));
	roots.push(root);
	return new PorcupineTaskStore(root);
}

// The idle drain is modeled here: check for queued runs, then adopt the first.
function drainOne(store: PorcupineTaskStore, taskId: string, claimRunId: string): void {
	const run = store.startRun(taskId, { type: "manual", claimRunId });
	store.completeRun(run.id, "Done.");
}

describe("task chaining", () => {
	it("enqueues the next task when a task completes", () => {
		const store = createStore();
		const first = store.createTask({ title: "First", prompt: "Do first." });
		const second = store.createTask({ title: "Second", prompt: "Do second." });
		store.patchTask({ id: first.id, next: second.id });

		const run = store.startRun(first.id, { type: "manual" });
		store.completeRun(run.id, "ok");

		const queued = store.claimQueuedRuns(1);
		expect(queued).toHaveLength(1);
		expect(queued[0]!.taskId).toBe(second.id);
	});

	it("enqueues the nextOnFail task when a task fails", () => {
		const store = createStore();
		const first = store.createTask({ title: "First", prompt: "Do first." });
		const fallback = store.createTask({ title: "Fallback", prompt: "Recoverc." });
		store.patchTask({ id: first.id, nextOnFail: fallback.id });

		const run = store.startRun(first.id, { type: "manual" });
		store.failRun(run.id, "boom");

		const queued = store.claimQueuedRuns(1);
		expect(queued).toHaveLength(1);
		expect(queued[0]!.taskId).toBe(fallback.id);
	});

	it("does not enqueue the success chain on failure (and vice versa)", () => {
		const store = createStore();
		const first = store.createTask({ title: "First", prompt: "Do first." });
		const onOk = store.createTask({ title: "OnOk", prompt: "After ok." });
		const onFail = store.createTask({ title: "OnFail", prompt: "After fail." });
		store.patchTask({ id: first.id, next: onOk.id, nextOnFail: onFail.id });

		store.failRun(store.startRun(first.id, { type: "manual" }).id, "boom");
		expect(store.claimQueuedRuns(1).map((r) => r.taskId)).toEqual([onFail.id]);
	});

	it("rejects a chain cycle A -> B -> A", () => {
		const store = createStore();
		const a = store.createTask({ title: "A", prompt: "A." });
		const b = store.createTask({ title: "B", prompt: "B." });
		store.patchTask({ id: a.id, next: b.id });
		expect(() => store.patchTask({ id: b.id, next: a.id })).toThrow(/cycle/i);
	});

	it("rejects a self-referencing chain link", () => {
		const store = createStore();
		const a = store.createTask({ title: "A", prompt: "A." });
		expect(() => store.patchTask({ id: a.id, next: a.id })).toThrow(/cycle|itself/i);
	});

	it("chains through a chain command that produces a multi-step path, then the queue is drained in order", () => {
		const store = createStore();
		const first = store.createTask({ title: "First", prompt: "1." });
		const second = store.createTask({ title: "Second", prompt: "2." });
		const third = store.createTask({ title: "Third", prompt: "3." });
		store.patchTask({ id: first.id, next: second.id });
		store.patchTask({ id: second.id, next: third.id });

		// Run first manually; it enqueues second.
		const run = store.startRun(first.id, { type: "manual" });
		store.completeRun(run.id, "ok");

		// Drain second; it enqueues third.
		const [nextRun] = store.claimQueuedRuns(1);
		drainOne(store, nextRun!.taskId, nextRun!.id);

		const queued = store.claimQueuedRuns(1);
		expect(queued).toHaveLength(1);
		expect(queued[0]!.taskId).toBe(third.id);
	});
});

describe("event triggers", () => {
	it("file trigger fires only when the file content changes", () => {
		const store = createStore();
		const file = join(store.agentDir, "watchme.txt");
		writeFileSync(file, "version-1", "utf8");

		const task = store.createTask({
			title: "Watch",
			prompt: "React to change.",
			trigger: { type: "file", path: file },
		});

		// Baseline observation: no change yet, so nothing is claimed.
		expect(store.claimQueuedRuns(1)).toHaveLength(0);
		expect(store.claimQueuedRuns(1)).toHaveLength(0);

		// Content changes -> the trigger fires and a run is claimed.
		writeFileSync(file, "version-2", "utf8");
		const claimed = store.claimQueuedRuns(1);
		expect(claimed).toHaveLength(1);
		expect(claimed[0]!.taskId).toBe(task.id);
	});

	it("file trigger with a matches regex requires the new content to match", () => {
		const store = createStore();
		const file = join(store.agentDir, "watchme.txt");
		writeFileSync(file, "alpha", "utf8");
		store.createTask({
			title: "Watch",
			prompt: "React.",
			trigger: { type: "file", path: file, matches: "beta" },
		});
		// Baseline with "beta" absent from "alpha".
		expect(store.claimQueuedRuns(1)).toHaveLength(0);
		// Change to match the pattern -> fires.
		writeFileSync(file, "beta-alpha", "utf8");
		expect(store.claimQueuedRuns(1)).toHaveLength(1);
	});

	it("script trigger fires when the check command exits 0", () => {
		const store = createStore();
		const task = store.createTask({
			title: "Health",
			prompt: "Run when healthy.",
			trigger: { type: "script", command: "true", exitCode: 0 },
		});
		const claimed = store.claimQueuedRuns(1);
		expect(claimed).toHaveLength(1);
		expect(claimed[0]!.taskId).toBe(task.id);
	});

	it("script trigger does not fire when the check command exits non-zero", () => {
		const store = createStore();
		store.createTask({
			title: "Health",
			prompt: "Run when healthy.",
			trigger: { type: "script", command: "false", exitCode: 0 },
		});
		expect(store.claimQueuedRuns(1)).toHaveLength(0);
	});

	it("does not evaluate triggers on paused tasks", () => {
		const store = createStore();
		const task = store.createTask({
			title: "Health",
			prompt: "Run when healthy.",
			trigger: { type: "script", command: "true", exitCode: 0 },
		});
		store.setTaskStatus(task.id, "paused");
		expect(store.claimQueuedRuns(1)).toHaveLength(0);
	});
});
