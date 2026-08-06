/**
 * Durable Tasks & Cron routines tool.
 *
 * Tasks are local, durable definitions with append-only run history. Cron
 * schedules decide when a task is eligible to run. Execution is attended-only:
 * a task runs on the current interactive session (current model + permission
 * policy) and only while the session is open and idle. "run" queues a claimed
 * run for the next idle moment instead of executing inline.
 */

import type { AgentTool } from "@porcupineai/agent-core";
import { Text } from "@porcupineai/tui";
import { type Static, Type } from "typebox";
import { getAgentDir } from "../../config.ts";
import { theme } from "../../modes/interactive/theme/theme.ts";
import { PorcupineTaskStore } from "../../porcupine/task-scheduler.ts";
import type { ToolDefinition } from "../extensions/types.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

const tasksSchema = Type.Object({
	action: Type.Union(
		[
			Type.Literal("list"),
			Type.Literal("create"),
			Type.Literal("show"),
			Type.Literal("run"),
			Type.Literal("pause"),
			Type.Literal("resume"),
			Type.Literal("cancel"),
			Type.Literal("schedule_list"),
			Type.Literal("schedule_add"),
			Type.Literal("schedule_pause"),
			Type.Literal("schedule_resume"),
			Type.Literal("schedule_remove"),
		],
		{
			description:
				"list | create | show | run | pause | resume | cancel | schedule_list | schedule_add | schedule_pause | schedule_resume | schedule_remove",
		},
	),
	taskId: Type.Optional(Type.String({ description: "Task id (required for show/run/pause/resume/cancel)" })),
	title: Type.Optional(Type.String({ description: "Task title (action=create)" })),
	prompt: Type.Optional(Type.String({ description: "Task instructions (action=create)" })),
	scheduleId: Type.Optional(Type.String({ description: "Cron schedule id (schedule_pause/resume/remove)" })),
	expression: Type.Optional(
		Type.String({
			description:
				"Five-field cron expression: minute hour day-of-month month day-of-week (UTC), e.g. '*/15 * * * *'",
		}),
	),
});

export type TasksToolInput = Static<typeof tasksSchema>;

export interface TasksToolDetails {
	action: string;
	taskId?: string;
	scheduleId?: string;
	queuedRunId?: string;
}

export interface TasksToolOptions {
	/** Agent home (~/.porcupine/agent). Defaults to getAgentDir(). */
	agentDir?: string;
	/** Store override (tests). */
	store?: PorcupineTaskStore;
}

function formatTasksList(store: PorcupineTaskStore): string {
	const tasks = store.listTasks();
	if (tasks.length === 0) {
		return "No tasks yet. Create one with action=create (title + prompt).\nRun it with action=run or schedule it with action=schedule_add.";
	}
	return tasks
		.map(
			(task) =>
				`• ${task.id}  [${task.status}]  ${task.title}  (${task.runCount} run${task.runCount === 1 ? "" : "s"})`,
		)
		.join("\n");
}

function formatTaskDetail(store: PorcupineTaskStore, taskId: string): string {
	const task = store.getTask(taskId);
	if (!task) return `Task not found: ${taskId}`;
	const runs = store.listRuns(taskId);
	const history =
		runs.length === 0
			? "No runs yet."
			: runs
					.map(
						(run) =>
							`• ${run.id}  [${run.status}]  ${run.trigger.type}  ${run.startedAt}${run.error ? `\n  error: ${run.error}` : ""}${run.result ? `\n  result: ${run.result}` : ""}`,
					)
					.join("\n");
	return `${task.title}\n${task.id}  [${task.status}]  ${task.runCount} run${task.runCount === 1 ? "" : "s"}\n\nPrompt\n${task.prompt}\n\nRun history\n${history}`;
}

function formatSchedulesList(store: PorcupineTaskStore): string {
	const schedules = store.listSchedules();
	if (schedules.length === 0) {
		return "No cron routines yet. Add one with action=schedule_add (taskId + five-field UTC expression).";
	}
	return schedules
		.map((schedule) => {
			const task = store.getTask(schedule.taskId);
			return `• ${schedule.id}  [${schedule.enabled ? "active" : "paused"}]  ${schedule.expression} → ${task?.title ?? schedule.taskId}\n  next: ${schedule.nextRunAt}`;
		})
		.join("\n");
}

export function createTasksToolDefinition(
	options?: TasksToolOptions,
): ToolDefinition<typeof tasksSchema, TasksToolDetails | undefined> {
	const agentDir = options?.agentDir ?? getAgentDir();
	let store: PorcupineTaskStore | undefined;

	const getStore = (): PorcupineTaskStore => {
		store ??= options?.store ?? new PorcupineTaskStore(agentDir);
		return store;
	};

	return {
		name: "tasks",
		label: "tasks",
		description:
			"Durable local tasks and cron routines. action=list shows tasks; action=create saves a task (title + prompt); action=show lists a task with append-only run history; action=run queues a task for the next idle moment (it runs on the current session with its model and permission policy, never inline); action=pause|resume|cancel changes task state (pausing or cancelling a task pauses its attached cron routines). action=schedule_list|schedule_add|schedule_pause|schedule_resume|schedule_remove manage cron routines (five-field UTC expression). Tasks run only while the interactive session is open and idle.",
		promptSnippet: "Durable Tasks + Cron routines (create/list/run/pause/schedule)",
		promptGuidelines: [
			"Use action=run to queue a task when the user asks to run it; it executes after the current turn when the session is idle.",
			"Tasks are durable local definitions with append-only run history; cron decides when a task is eligible to run.",
			"Pausing or cancelling a task pauses its attached routines. Recurring tasks return to ready after a terminal run.",
			"Cron is attended-only: it runs only while the interactive session is open and idle, with the current model and permission policy.",
			"Run history: a run abandoned by process exit becomes 'unknown' — never claim a task completed without evidence.",
		],
		parameters: tasksSchema,
		async execute(_toolCallId, args) {
			const current = getStore();
			const action = args.action;
			const taskId = args.taskId?.trim();
			const scheduleId = args.scheduleId?.trim();
			const title = args.title?.trim();
			const prompt = args.prompt?.trim();
			const expression = args.expression?.trim();

			let text: string;
			switch (action) {
				case "list":
					text = formatTasksList(current);
					break;
				case "create": {
					if (!title || !prompt) {
						text = "action=create requires both title and prompt.";
						break;
					}
					const task = current.createTask({ title, prompt });
					text = `Task saved: ${task.title} (${task.id})\nQueue it with action=run or schedule it with action=schedule_add.`;
					break;
				}
				case "show":
					if (!taskId) {
						text = "action=show requires taskId.";
						break;
					}
					text = formatTaskDetail(current, taskId);
					break;
				case "run": {
					if (!taskId) {
						text = "action=run requires taskId.";
						break;
					}
					try {
						const run = current.queueTaskRun(taskId);
						text = `Task ${taskId} queued (run ${run.id}). It will start when the session is idle.`;
					} catch (error) {
						text = error instanceof Error ? error.message : String(error);
					}
					break;
				}
				case "pause":
				case "resume":
				case "cancel": {
					if (!taskId) {
						text = `action=${action} requires taskId.`;
						break;
					}
					const status = action === "pause" ? "paused" : action === "resume" ? "ready" : "cancelled";
					try {
						const task = current.setTaskStatus(taskId, status);
						text = `Task ${task.id} is ${task.status}.`;
					} catch (error) {
						text = error instanceof Error ? error.message : String(error);
					}
					break;
				}
				case "schedule_list":
					text = formatSchedulesList(current);
					break;
				case "schedule_add": {
					if (!taskId || !expression) {
						text = "action=schedule_add requires taskId and a five-field UTC cron expression.";
						break;
					}
					try {
						const schedule = current.createSchedule({ taskId, expression });
						text = `Cron routine saved: ${schedule.id}; next ${schedule.nextRunAt}`;
					} catch (error) {
						text = error instanceof Error ? error.message : String(error);
					}
					break;
				}
				case "schedule_pause":
				case "schedule_resume": {
					if (!scheduleId) {
						text = `action=${action} requires scheduleId.`;
						break;
					}
					try {
						const schedule = current.setScheduleEnabled(scheduleId, action === "schedule_resume");
						text = `Cron routine ${schedule.id} is ${schedule.enabled ? "active" : "paused"}.`;
					} catch (error) {
						text = error instanceof Error ? error.message : String(error);
					}
					break;
				}
				case "schedule_remove": {
					if (!scheduleId) {
						text = "action=schedule_remove requires scheduleId.";
						break;
					}
					try {
						current.removeSchedule(scheduleId);
						text = `Cron routine removed: ${scheduleId}`;
					} catch (error) {
						text = error instanceof Error ? error.message : String(error);
					}
					break;
				}
				default:
					text = `Unknown action: ${action}`;
					break;
			}

			return {
				content: [{ type: "text", text }],
				details: {
					action,
					taskId,
					scheduleId,
				} satisfies TasksToolDetails,
			};
		},
		renderCall(args) {
			const action = String(args?.action ?? "?");
			const target = String(args?.taskId ?? args?.scheduleId ?? "");
			return new Text(
				`${theme.fg("toolTitle", theme.bold("tasks"))} ${theme.fg("toolOutput", `${action} ${target}`.trim())}`,
				0,
				0,
			);
		},
		renderResult(result, options) {
			const text = (result.content ?? [])
				.map((c) => (c.type === "text" ? c.text : ""))
				.join("")
				.trim();
			const preview = options.expanded ? text : text.split("\n").slice(0, 12).join("\n");
			return new Text(`\n${theme.fg("toolOutput", preview || "(empty)")}`, 0, 0);
		},
	};
}

export function createTasksTool(options?: TasksToolOptions): AgentTool<typeof tasksSchema> {
	return wrapToolDefinition(createTasksToolDefinition(options));
}
