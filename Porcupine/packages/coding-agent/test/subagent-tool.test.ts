import type { AgentTool } from "@porcupineai/agent-core";
import { describe, expect, it } from "vitest";
import { createStopSubagentToolDefinition, createSubagentToolDefinition } from "../src/core/tools/subagent.ts";

function noopTool(name: string): AgentTool<any> {
	return {
		name,
		label: name,
		description: "noop",
		parameters: { type: "object", properties: {} },
		execute: async () => ({ content: [{ type: "text", text: "ok" }], details: {} }),
	};
}

function makeTool(options: Partial<Parameters<typeof createSubagentToolDefinition>[0]> = {}) {
	return createSubagentToolDefinition({
		getToolRegistry: () =>
			new Map([
				["read", noopTool("read")],
				["bash", noopTool("bash")],
			]),
		resolveModel: () => undefined,
		getStreamFn: () => (async () => undefined) as never,
		getSettings: () => ({ model: undefined, maxSteps: 30, contextWindow: 256_000, maxConcurrent: 1 }),
		...options,
	});
}

describe("stop_subagent tool", () => {
	const stopTool = createStopSubagentToolDefinition({
		stop: (id) => id === "sa-1",
		stopAll: () => 2,
		getActiveIds: () => ["sa-1", "sa-2"],
	});

	it("stops a single sub-agent by id", async () => {
		const result = await stopTool.execute("id", { id: "sa-1" }, undefined, undefined, undefined as never);
		const text = result.content
			.filter((part) => part.type === "text")
			.map((part) => part.text)
			.join("\n");
		expect(text).toContain("⏹ Stopped sub-agent sa-1");
		expect(result.details).toMatchObject({ stopped: 1 });
	});

	it("reports when the id is not running and lists active ids", async () => {
		const result = await stopTool.execute("id", { id: "sa-9" }, undefined, undefined, undefined as never);
		const text = result.content
			.filter((part) => part.type === "text")
			.map((part) => part.text)
			.join("\n");
		expect(text).toContain('No running sub-agent "sa-9"');
		expect(text).toContain("sa-1, sa-2");
		expect(result.details).toMatchObject({ stopped: 0 });
	});

	it("stops all running sub-agents when id is omitted", async () => {
		const result = await stopTool.execute("id", {}, undefined, undefined, undefined as never);
		const text = result.content
			.filter((part) => part.type === "text")
			.map((part) => part.text)
			.join("\n");
		expect(text).toContain("Stopped 2 sub-agents");
		expect(result.details).toMatchObject({ stopped: 2 });
	});
});

describe("subagent tool", () => {
	it("rejects when another sub-agent is already running", async () => {
		const tool = makeTool({ getActiveSubagentRuns: () => 1 });
		const result = await tool.execute("id-1", { task: "do the thing" }, undefined, undefined, undefined as never);

		const text = result.content
			.filter((part) => part.type === "text")
			.map((part) => part.text)
			.join("\n");
		expect(text).toContain("capacity reached");
		expect(result.details).toMatchObject({ started: false });
	});

	it("respects subagent.maxConcurrent instead of a hardcoded limit of one", async () => {
		const { registerFauxProvider, fauxAssistantMessage, streamSimple } = await import("@porcupineai/ai/compat");
		const faux = registerFauxProvider();
		faux.setResponses([fauxAssistantMessage("Report: done.")]);

		let active = 2; // maxConcurrent 3: 2 active runs still leaves capacity
		const tool = makeTool({
			resolveModel: () => faux.getModel(),
			getStreamFn: () => streamSimple,
			getSettings: () => ({ model: undefined, maxSteps: 30, contextWindow: 256_000, maxConcurrent: 3 }),
			getActiveSubagentRuns: () => active,
		});

		const allowed = await tool.execute("id-1", { task: "do the thing" }, undefined, undefined, undefined as never);
		expect(allowed.details).toMatchObject({ started: true });

		active = 3; // capacity full -> rejected
		const full = await tool.execute("id-2", { task: "do the thing" }, undefined, undefined, undefined as never);
		const fullText = full.content
			.filter((part) => part.type === "text")
			.map((part) => part.text)
			.join("\n");
		expect(fullText).toContain("3/3 running");
		expect(full.details).toMatchObject({ started: false });
		faux.unregister();
	});

	it("reports when the configured sub-agent model cannot be resolved", async () => {
		const tool = makeTool({ resolveModel: () => undefined });
		const result = await tool.execute("id-1", { task: "do the thing" }, undefined, undefined, undefined as never);

		const text = result.content
			.filter((part) => part.type === "text")
			.map((part) => part.text)
			.join("\n");
		expect(text).toContain("Could not resolve sub-agent model");
	});

	it("exposes a prompt snippet so the model knows when to use it", () => {
		const tool = makeTool();
		expect(tool.name).toBe("subagent");
		expect(tool.promptSnippet).toContain("sub-agent");
		expect(tool.promptGuidelines?.length).toBeGreaterThan(0);
	});
});

describe("subagent tool activation (regression: default tool list)", () => {
	it("is in the SDK default active tools so it actually reaches the agent", async () => {
		const { defaultActiveToolNames } = await import("../src/core/sdk.ts");
		expect(defaultActiveToolNames).toContain("subagent");
		expect(defaultActiveToolNames).toContain("capability_search");
	});

	it("is in allToolNames and produced by createAllToolDefinitions", async () => {
		const { allToolNames } = await import("../src/core/tools/index.ts");
		expect(allToolNames.has("subagent")).toBe(true);
		const { createAllToolDefinitions } = await import("../src/core/tools/index.ts");
		const defs = createAllToolDefinitions(process.cwd());
		expect(defs.subagent.name).toBe("subagent");
	});
});

describe("subagent tool — background mode", () => {
	it("registers a cancel handle and unregisters it when the run settles", async () => {
		const { registerFauxProvider, fauxAssistantMessage, streamSimple } = await import("@porcupineai/ai/compat");
		const faux = registerFauxProvider();
		faux.setResponses([fauxAssistantMessage("Report: done.")]);

		const registered: string[] = [];
		const unregistered: string[] = [];

		const tool = makeTool({
			resolveModel: () => faux.getModel(),
			getStreamFn: () => streamSimple,
			onRegister: (id, cancel) => {
				registered.push(id);
				expect(typeof cancel).toBe("function");
			},
			onUnregister: (id) => unregistered.push(id),
		});

		const result = await tool.execute("id-1", { task: "do the thing" }, undefined, undefined, undefined as never);
		expect(result.details).toMatchObject({ started: true });

		await new Promise((resolve) => setTimeout(resolve, 200));
		expect(registered.length).toBe(1);
		expect(unregistered).toEqual(registered);
		faux.unregister();
	});

	it("returns immediately with an id while the sub-agent runs in the background", async () => {
		const { registerFauxProvider, fauxAssistantMessage, streamSimple } = await import("@porcupineai/ai/compat");
		const faux = registerFauxProvider();
		faux.setResponses([fauxAssistantMessage("Report: done.")]);
		const completed: unknown[] = [];

		const tool = makeTool({
			resolveModel: () => faux.getModel(),
			getStreamFn: () => streamSimple,
			onComplete: async (id, result) => {
				completed.push({ id, result });
			},
		});

		const result = await tool.execute("id-1", { task: "do the thing" }, undefined, undefined, undefined as never);
		const text = result.content
			.filter((part) => part.type === "text")
			.map((part) => part.text)
			.join("\n");

		// Background: returns immediately, no final report yet.
		expect(text).toContain("Sub-agent started");
		expect(result.details).toMatchObject({ started: true, background: true });
		expect(typeof (result.details as { id?: string }).id).toBe("string");

		// The report lands via onComplete once the background run finishes.
		await new Promise((resolve) => setTimeout(resolve, 200));
		expect(completed.length).toBe(1);
		faux.unregister();
	});
});
