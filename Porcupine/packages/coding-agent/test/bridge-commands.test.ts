import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleBridgeCommand, parseBridgeCommand } from "../src/porcupine/bridge-commands.ts";
import { PorcupineTaskStore } from "../src/porcupine/task-scheduler.ts";

describe("parseBridgeCommand", () => {
	it("parses !help / !status / !tasks", () => {
		expect(parseBridgeCommand("!help")).toEqual({ type: "help" });
		expect(parseBridgeCommand("!status")).toEqual({ type: "status" });
		expect(parseBridgeCommand("!tasks")).toEqual({ type: "tasks" });
	});

	it("parses !run with a task id", () => {
		expect(parseBridgeCommand("!run abc-123")).toEqual({ type: "run", taskId: "abc-123" });
		expect(parseBridgeCommand("  !run  abc-123  ")).toEqual({ type: "run", taskId: "abc-123" });
	});

	it("is case-insensitive", () => {
		expect(parseBridgeCommand("!STATUS")).toEqual({ type: "status" });
	});

	it("returns null for non-command messages", () => {
		expect(parseBridgeCommand("help me fix this")).toBeNull();
		expect(parseBridgeCommand("")).toBeNull();
	});

	it("returns unknown for unmatched ! commands", () => {
		expect(parseBridgeCommand("!bogus")).toEqual({ type: "unknown" });
		expect(parseBridgeCommand("!")).toEqual({ type: "unknown" });
	});
});

describe("handleBridgeCommand", () => {
	let agentDir: string;
	let store: PorcupineTaskStore;

	beforeEach(() => {
		agentDir = join(tmpdir(), `porcupine-bridge-cmd-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(agentDir, { recursive: true });
		store = new PorcupineTaskStore(agentDir);
	});

	afterEach(() => {
		rmSync(agentDir, { recursive: true, force: true });
	});

	it("!help lists the available commands", () => {
		const reply = handleBridgeCommand({ type: "help" }, { context: { agentDir } });
		expect(reply).toContain("!status");
		expect(reply).toContain("!tasks");
		expect(reply).toContain("!run");
	});

	it("!tasks lists stored tasks with status", () => {
		store.createTask({ title: "Metrics digest", prompt: "run the digest" });
		const reply = handleBridgeCommand({ type: "tasks" }, { context: { agentDir } });
		expect(reply).toContain("Metrics digest");
		expect(reply).toContain("ready");
	});

	it("!status reports mode, session and uptime", () => {
		const reply = handleBridgeCommand(
			{ type: "status" },
			{ context: { agentDir, sessionInfo: { mode: "auto", sessionId: "s-1" }, uptimeSeconds: 90 } },
		);
		expect(reply).toContain("mode: auto");
		expect(reply).toContain("session: s-1");
		expect(reply).toContain("uptime: 1m 30s");
	});

	it("!run queues a task for the next drain", () => {
		const task = store.createTask({ title: "Digest", prompt: "run" });
		const reply = handleBridgeCommand({ type: "run", taskId: task.id }, { context: { agentDir } });
		expect(reply).toContain("Queued");
		expect(reply).toContain("Digest");
		expect(reply).toContain("run-");
	});

	it("!run with an unknown id returns a safe error", () => {
		const reply = handleBridgeCommand({ type: "run", taskId: "nope-not-a-task" }, { context: { agentDir } });
		expect(reply).toContain("Unknown task id");
		expect(reply).not.toContain(agentDir);
	});

	it("unknown commands get a usage hint", () => {
		const reply = handleBridgeCommand({ type: "unknown" }, { context: { agentDir } });
		expect(reply).toContain("!help");
	});
});
