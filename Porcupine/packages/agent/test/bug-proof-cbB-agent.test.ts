/**
 * Bug-proof (Part B, corrected by main agent — the original repro hung):
 *
 * B1: a throwing agent_end listener causes handleRunFailure to emit a SECOND
 *     fabricated agent_end (with the subscriber's error as errorMessage),
 *     double-delivering the terminal event + poisoning the transcript.
 * B2: runSubagent's step budget is advisory-by-one — the tool call that
 *     crosses maxSteps still executes (onStep runs, then tool.execute runs).
 */
import { type AssistantMessage, type AssistantMessageEvent, EventStream, type Model } from "@porcupineai/ai";
import { Type } from "typebox";
import { describe, expect, it } from "vitest";
import { Agent } from "../src/agent.ts";
import { runSubagent } from "../src/porcupine/subagent.ts";
import type { AgentMessage, AgentTool } from "../src/types.ts";

class MockAssistantStream extends EventStream<AssistantMessageEvent, AssistantMessage> {
	constructor() {
		super(
			(event) => event.type === "done" || event.type === "error",
			(event) => {
				if (event.type === "done") return event.message;
				if (event.type === "error") return event.error;
				throw new Error("Unexpected event type");
			},
		);
	}
}

function createUsage() {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
}

function createModel() {
	return {
		id: "mock",
		name: "mock",
		api: "openai-responses",
		provider: "openai",
		baseUrl: "https://example.invalid",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 8192,
		maxTokens: 2048,
	} as Model<"openai-responses">;
}

function createAssistantMessage(
	content: AssistantMessage["content"],
	stopReason: AssistantMessage["stopReason"] = "stop",
): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "openai-responses",
		provider: "openai",
		model: "mock",
		usage: createUsage(),
		stopReason,
		timestamp: Date.now(),
	};
}

// B1: throwing agent_end listener -> double agent_end
describe("Agent subscriber throw at agent_end", () => {
	it("BUG: a throwing agent_end listener causes a second (fabricated) agent_end", async () => {
		const streamFn = () => {
			const stream = new MockAssistantStream();
			queueMicrotask(() => {
				stream.push({
					type: "done",
					reason: "stop",
					message: createAssistantMessage([{ type: "text", text: "hi" }]),
				});
			});
			return stream;
		};

		const agent = new Agent({ streamFn, initialState: { model: createModel() } });
		agent.subscribe((event) => {
			if (event.type === "agent_end") throw new Error("subscriber crashed at agent_end");
		});

		const agentEnds: AgentMessage[][] = [];
		agent.subscribe((event) => {
			if (event.type === "agent_end") agentEnds.push(event.messages);
		});

		await agent.prompt("hello").catch(() => {});

		// Correct behavior: exactly ONE agent_end. Bug: the catch in
		// runWithLifecycle -> handleRunFailure re-emits a fabricated agent_end.
		expect(agentEnds.length).toBe(1);
	});
});

// B2: sub-agent step budget overshoot
describe("runSubagent step budget is a hard ceiling", () => {
	it("BUG: the tool call that crosses maxSteps still executes", async () => {
		let executed = 0;
		const tool: AgentTool = {
			name: "calculate",
			label: "calculate",
			description: "calculate",
			parameters: Type.Object({ value: Type.Number() }),
			execute: async () => {
				executed++;
				return { content: [{ type: "text", text: "ok" }], details: {} };
			},
		};

		// Stateful stream: first assistant turn requests the tool, the second
		// stops. maxSteps=0 means NOTHING may execute. Bug: the over-budget
		// call runs because onStep fires and then tool.execute still runs.
		let calls = 0;
		const streamFn = () => {
			const stream = new MockAssistantStream();
			queueMicrotask(() => {
				calls += 1;
				stream.push({
					type: "done",
					reason: calls === 1 ? "toolUse" : "stop",
					message: createAssistantMessage(
						calls === 1
							? [{ type: "toolCall", id: "t", name: "calculate", arguments: {} }]
							: [{ type: "text", text: "done" }],
						calls === 1 ? "toolUse" : "stop",
					),
				});
			});
			return stream;
		};

		const result = await runSubagent({
			task: "compute",
			notes: undefined,
			systemPrompt: "you are a test agent",
			tools: [tool],
			model: createModel(),
			maxSteps: 0,
			maxContextTokens: 100000,
			streamFn,
		});

		expect(result.steps).toBeLessThanOrEqual(0);
		expect(executed).toBe(0);
	});
});
