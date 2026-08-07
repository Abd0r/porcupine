import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SettingsManager } from "../src/core/settings-manager.ts";
import {
	formatTaskRunResultSummary,
	PorcupineTaskStore,
	type TaskRunResultNotification,
} from "../src/porcupine/task-scheduler.ts";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function createStore(): PorcupineTaskStore {
	const root = mkdtempSync(join(tmpdir(), "porcupine-task-notify-"));
	roots.push(root);
	return new PorcupineTaskStore(root);
}

describe("task run result notification", () => {
	it("emits a completed notification with task, run, trigger, and a one-line summary", () => {
		const store = createStore();
		const notifications: TaskRunResultNotification[] = [];
		store.setTaskRunResultNotifier((notification) => notifications.push(notification));

		const task = store.createTask({ title: "Review", prompt: "Review changes." });
		const run = store.startRun(task.id, { type: "manual" });
		store.completeRun(run.id, "All changes look good.");

		expect(notifications).toHaveLength(1);
		const notification = notifications[0]!;
		expect(notification.taskId).toBe(task.id);
		expect(notification.runId).toBe(run.id);
		expect(notification.title).toBe("Review");
		expect(notification.status).toBe("completed");
		expect(notification.trigger).toEqual({ type: "manual" });
		expect(notification.summary).toContain("completed");
		expect(notification.summary).toContain('Task "Review"');
		expect(notification.summary).toContain("All changes look good.");
	});

	it("emits a failed notification for a cron-triggered run with the error as the summary", () => {
		const store = createStore();
		const notifications: TaskRunResultNotification[] = [];
		store.setTaskRunResultNotifier((notification) => notifications.push(notification));

		const task = store.createTask({ title: "Nightly backup", prompt: "Back everything up." });
		const schedule = store.createSchedule({ taskId: task.id, expression: "*/15 * * * *" });
		const [claimed] = store.claimDueSchedules(new Date(schedule.nextRunAt));
		const run = store.startRun(task.id, {
			type: "cron",
			scheduleId: schedule.id,
			claimRunId: claimed!.claimedRunId,
		});
		store.failRun(run.id, "Disk full during backup.");

		expect(notifications).toHaveLength(1);
		expect(notifications[0]).toMatchObject({
			taskId: task.id,
			status: "failed",
			trigger: { type: "cron" },
		});
		expect(notifications[0]!.summary).toContain("failed");
		expect(notifications[0]!.summary).toContain("(cron)");
		expect(notifications[0]!.summary).toContain("Disk full during backup.");
	});

	it("is a silent no-op when no consumer is registered (e.g. no bridge connected)", () => {
		const store = createStore();
		const task = store.createTask({ title: "Review", prompt: "Review changes." });
		const run = store.startRun(task.id, { type: "manual" });
		// No notifier registered — must not throw.
		expect(() => store.completeRun(run.id, "Done.")).not.toThrow();
	});

	it("flattens multi-line detail into a short one-line summary", () => {
		const summary = formatTaskRunResultSummary({
			title: "Review",
			status: "completed",
			trigger: { type: "cron" },
			detail: "  All\npassing\n tests.\n\n\n",
		});
		expect(summary).toBe('✅ Task "Review" completed (cron): All passing tests.');
	});
});

describe("notifyOnTaskCompletion setting", () => {
	it("defaults to on", () => {
		const manager = SettingsManager.inMemory({});
		expect(manager.getNotifyOnTaskCompletion()).toBe(true);
	});

	it("can be turned off and back on", () => {
		const manager = SettingsManager.inMemory({});
		manager.setNotifyOnTaskCompletion(false);
		expect(manager.getNotifyOnTaskCompletion()).toBe(false);
		manager.setNotifyOnTaskCompletion(true);
		expect(manager.getNotifyOnTaskCompletion()).toBe(true);
	});
});
