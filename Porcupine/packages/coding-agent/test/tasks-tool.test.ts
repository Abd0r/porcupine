import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTasksToolDefinition, type TasksToolInput } from "../src/core/tools/tasks.ts";
import { PorcupineTaskStore } from "../src/porcupine/task-scheduler.ts";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function createTool() {
	const root = mkdtempSync(join(tmpdir(), "porcupine-tasks-tool-"));
	roots.push(root);
	const store = new PorcupineTaskStore(root);
	return { tool: createTasksToolDefinition({ agentDir: root }), store, agentDir: root };
}

async function run(tool: ReturnType<typeof createTasksToolDefinition>, args: TasksToolInput): Promise<string> {
	const result = await tool.execute("t1", args, undefined, undefined, undefined as never);
	return result.content.map((c) => (c.type === "text" ? c.text : "")).join("");
}

describe("tasks tool", () => {
	it("creates, lists, queues, and shows a task", async () => {
		const { tool, store } = createTool();

		const created = await run(tool, { action: "create", title: "Nightly review", prompt: "Review today's changes." });
		expect(created).toContain("Task saved");

		const tasks = store.listTasks();
		expect(tasks).toHaveLength(1);
		const task = tasks[0]!;

		const list = await run(tool, { action: "list" });
		expect(list).toContain(task.id);

		const queued = await run(tool, { action: "run", taskId: task.id });
		expect(queued).toContain("queued");
		expect(store.claimQueuedRuns(1)).toHaveLength(1);

		const detail = await run(tool, { action: "show", taskId: task.id });
		expect(detail).toContain("claimed");
	});

	it("schedules and lists a cron routine via the tool", async () => {
		const { tool, store } = createTool();
		const task = store.createTask({ title: "Health", prompt: "Check health." });

		const added = await run(tool, {
			action: "schedule_add",
			taskId: task.id,
			expression: "*/15 * * * *",
		});
		expect(added).toContain("Cron routine saved");

		const schedules = store.listSchedules();
		expect(schedules).toHaveLength(1);
		expect(schedules[0]!.taskId).toBe(task.id);

		const list = await run(tool, { action: "schedule_list" });
		expect(list).toContain(schedules[0]!.id);
	});

	it("pauses a task and its routines via the tool", async () => {
		const { tool, store } = createTool();
		const task = store.createTask({ title: "Health", prompt: "Check health." });
		store.createSchedule({ taskId: task.id, expression: "0 9 * * *" });

		const paused = await run(tool, { action: "pause", taskId: task.id });
		expect(paused).toContain("paused");

		expect(store.getTask(task.id)!.status).toBe("paused");
		expect(store.listSchedules()[0]!.enabled).toBe(false);
	});

	it("rejects a bad cron expression with guidance", async () => {
		const { tool, store } = createTool();
		const task = store.createTask({ title: "Health", prompt: "Check health." });

		const added = await run(tool, { action: "schedule_add", taskId: task.id, expression: "not a cron" });
		expect(added).toMatch(/five fields|Cron/i);
	});

	it("reports when required args are missing", async () => {
		const { tool } = createTool();
		expect(await run(tool, { action: "create", title: "Only title" })).toContain("requires both title and prompt");
		expect(await run(tool, { action: "run" })).toContain("requires taskId");
	});
});
