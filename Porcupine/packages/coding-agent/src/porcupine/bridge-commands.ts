/**
 * Bridge command layer (remote control surface) for the Porcupine chat
 * bridges (Telegram / Discord / iMessage). Owner messages that start with a
 * '!' prefix are treated as control commands instead of normal session prompts:
 *
 *   !status — compact status line (session version/mode, uptime, active
 *             sub-agents when the session exposes it, latest task run).
 *   !tasks  — the durable task list read from the task store.
 *   !run <taskId> — queue a task run for the next idle drain.
 *   !help   — list the available commands.
 *
 * The '!' prefix avoids colliding with normal prompts. Only messages from an
 * allowed (owner) chat are dispatched — each bridge already enforces that
 * allowlist before reaching this module. Unknown commands, malformed arguments,
 * and unknown task ids get safe, non-secret replies.
 *
 * The module is deliberately bridge-agnostic: it accepts a small context object
 * (uptime, session info) and uses the PorcupineTaskStore public API for reads
 * and writes, so replies flow through the bridge's own send path unchanged.
 */

import { getAgentDir } from "../config.ts";
import { PorcupineTaskStore } from "./task-scheduler.ts";

/** One-line session/activity snapshot a bridge can provide for !status. */
export interface BridgeCommandContext {
	/** Seconds elapsed since the bridge started polling (uptime). */
	uptimeSeconds?: number;
	/** Whether the shared session is currently active/idle. */
	sessionActive?: boolean;
	/** Optional richer session info (wired if the interactive mode exposes it). */
	sessionInfo?: {
		sessionId?: string;
		cwd?: string;
		mode?: string;
		/** Active sub-agent count from the session's footer chip. */
		activeSubagents?: number;
	};
	/** Raw getStatus() output (e.g. "session: s1\ncwd: …\nmode: …") if available. */
	statusText?: string;
	/** Agent config directory used to derive the task store. Defaults to getAgentDir(). */
	agentDir?: string;
}

export type ParsedBridgeCommand =
	| { type: "status" }
	| { type: "tasks" }
	| { type: "help" }
	| { type: "run"; taskId: string }
	| { type: "unknown" };

/**
 * Parse an inbound owner message. Returns null when the text is not a '!'
 * command (so the bridge falls through to normal prompt handling). Commands are
 * matched case-insensitively.
 */
export function parseBridgeCommand(text: string): ParsedBridgeCommand | null {
	const trimmed = text.trim();
	if (!trimmed.startsWith("!")) return null;
	const [head, ...rest] = trimmed.split(/\s+/);
	const name = (head ?? "").toLowerCase();
	if (name === "!status") return { type: "status" };
	if (name === "!tasks") return { type: "tasks" };
	if (name === "!help") return { type: "help" };
	if (name === "!run") {
		// Task ids carry no spaces; joining is defensive against stray whitespace.
		return { type: "run", taskId: rest.join(" ").trim() };
	}
	return { type: "unknown" };
}

/**
 * Dispatch a parsed command and return the reply text to send back to the owner
 * chat. Throws only for true internal errors; every user-facing branch returns
 * a clean message and never exposes secrets or store internals.
 */
export function handleBridgeCommand(parsed: ParsedBridgeCommand, options: { context?: BridgeCommandContext }): string {
	const context = options.context ?? {};
	if (parsed.type === "unknown") {
		return "Unknown command. Type !help for the available commands.";
	}
	if (parsed.type === "help") {
		return helpText();
	}
	const store = createStore(context.agentDir);
	if (parsed.type === "status") {
		return statusReply(context, store);
	}
	if (parsed.type === "tasks") {
		return tasksReply(store);
	}
	return runReply(store, parsed.taskId);
}

function createStore(agentDir: string | undefined): PorcupineTaskStore {
	return new PorcupineTaskStore(agentDir ?? getAgentDir());
}

// ---------------------------------------------------------------------------
// Command implementations
// ---------------------------------------------------------------------------

function statusReply(context: BridgeCommandContext, store: PorcupineTaskStore): string {
	const info = context.sessionInfo;
	const active = context.sessionActive === false ? "no" : "yes";
	const line: string[] = [];

	const mode = info?.mode ?? extractField(context.statusText, "mode") ?? "unknown";
	line.push(`mode: ${mode}`);
	const sessionId = info?.sessionId ?? extractField(context.statusText, "session") ?? "n/a";
	line.push(`session: ${sessionId}`);
	if (info?.cwd ?? extractField(context.statusText, "cwd")) {
		line.push(`cwd: ${info?.cwd ?? extractField(context.statusText, "cwd")}`);
	}
	line.push(`session active: ${active}`);
	const subagents = info?.activeSubagents;
	line.push(subagents === undefined ? "active sub-agents: n/a" : `active sub-agents: ${subagents}`);
	line.push(`uptime: ${formatUptime(context.uptimeSeconds)}`);

	const latest = store.listRuns()[0];
	if (latest) {
		const task = store.getTask(latest.taskId);
		line.push(`latest run: ${task?.title ?? latest.taskId} [${latest.status}]`);
	} else {
		line.push("latest run: none yet");
	}

	return line.join("\n");
}

function tasksReply(store: PorcupineTaskStore): string {
	const tasks = store.listTasks();
	if (tasks.length === 0) return "No tasks. Add one with the TUI /task add command.";
	return tasks.map((task) => `${task.id}: ${task.title} [${task.status}]`).join("\n");
}

function runReply(store: PorcupineTaskStore, taskId: string): string {
	if (!taskId) return "Usage: !run <taskId>. e.g. !run task-2f3a8c1b.";
	const task = store.getTask(taskId);
	if (!task) return `Unknown task id: ${taskId}. Type !tasks to list tasks.`;
	if (task.status === "paused" || task.status === "cancelled") {
		return `Task ${taskId} is ${task.status} and cannot be queued.`;
	}
	try {
		const run = store.queueTaskRun(taskId);
		return `Queued "${task.title}" (${run.id}) for the next idle drain.`;
	} catch (error) {
		return `Could not queue task ${taskId}: ${error instanceof Error ? error.message : String(error)}`;
	}
}

function helpText(): string {
	return [
		"Control commands (owner chat only):",
		"  !status — session state, uptime, latest task run",
		"  !tasks — list durable tasks",
		"  !run <taskId> — queue a task for the next drain",
		"  !help — this message",
	].join("\n");
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Pull `key: value` (or `key · value`) out of a raw status line, e.g. getStatus(). */
function extractField(statusText: string | undefined, key: string): string | undefined {
	if (!statusText) return undefined;
	for (const line of statusText.split("\n")) {
		const match = new RegExp(`^\\s*${key}\\s*[:·]\\s*(.+?)\\s*$`, "i").exec(line);
		if (match) return match[1];
	}
	return undefined;
}

function formatUptime(seconds: number | undefined): string {
	if (seconds === undefined || Number.isNaN(seconds) || seconds < 0) return "n/a";
	const total = Math.floor(seconds);
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const secs = total % 60;
	if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
	if (minutes > 0) return `${minutes}m ${secs}s`;
	return `${secs}s`;
}
