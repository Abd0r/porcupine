import { type AssistantMessage, type AssistantMessageEvent, EventStream, type Model } from "@porcupineai/ai";
import { describe, expect, it } from "vitest";
import { Agent } from "../src/agent.ts";
import { runSubagent } from "../src/porcupine/subagent.ts";
import type { AgentTool } from "../src/types.ts";

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

function assistant(content: AssistantMessage["content"], stopReason: AssistantMessage["stopReason"] = "stop") {
	return {
		role: "assistant",
		content,
		api: "openai-responses",
		provider: "openai",
		model: "mock",
		usage: createUsage(),
		stopReason,
		timestamp: Date.now(),
	} as AssistantMessage;
}

// ===========================================================================
// CONFIRMED BUG 1: runSubagent reports ok=true when the LLM call errors
// (a normal stopReason:"error" encoded in the stream is never detected)
// ===========================================================================
describe("runSubagent ok semantics (bug-proof-cbB-agent)", () => {
	it("REGRESSION: LLM stopReason=error is reported as ok=true with no error", async () => {
		const streamFn = () => {
			const s = new MockAssistantStream();
			queueMicrotask(() => s.push({ type: "error", reason: "error", error: assistant([], "error") as any }));
			return s;
		};
		const result = await runSubagent({
			task: "do x",
			model: createModel(),
			streamFn,
			tools: [],
			systemPrompt: "you are a subagent",
		});
		// A provider failure must not be surfaced as a successful sub-agent result.
		expect(result.ok).toBe(false);
		expect(result.error).toBeTruthy();
	});

	// =======================================================================
	// CONFIRMED BUG 2: sub-agent step budget overshoot — the tool that eclipses
	// maxSteps still executes.
	// =======================================================================
	it("REGRESSION: maxSteps=1 still executes a second tool (overshoot)", async () => {
		let executed = 0;
		const tool: AgentTool<any, any> = {
			label: "noop",
			name: "noop",
			description: "noop",
			parameters: { type: "object", properties: {} } as any,
			execute: async () => {
				executed += 1;
				return { content: [{ type: "text", text: "ran" }], details: {} };
			},
		};

		let callCount = 0;
		const streamFn: any = (_model: any, _ctx: any, options: any) => {
			const s = new MockAssistantStream();
			const signal: AbortSignal | undefined = options?.signal;
			queueMicrotask(() => {
				if (signal?.aborted) {
					s.push({ type: "error", reason: "aborted", error: assistant([], "aborted") as any });
					return;
				}
				if (callCount < 6) {
					callCount += 1;
					s.push({
						type: "done",
						reason: "toolUse",
						message: assistant(
							[{ type: "toolCall", id: `t${callCount}`, name: "noop", arguments: {} }],
							"toolUse",
						),
					});
				} else {
					s.push({ type: "done", reason: "stop", message: assistant([{ type: "text", text: "final" }]) });
				}
			});
			return s;
		};

		const result = await runSubagent({
			task: "keep going",
			model: createModel(),
			streamFn,
			tools: [tool],
			systemPrompt: "subagent prompt",
			maxSteps: 1,
		});

		// The budget must be a hard cap: no more than maxSteps tools may run.
		expect(executed).toBe(1);
		expect(result.budgetExhausted).toBe(true);
	});

	// ===========================================================================
	// OBSERVATION: plain Agent class — a subscriber throwing at agent_end does not
	// reject agent.prompt (error is not propagated to the caller). Recorded for
	// reference; upstream harness handles subscriber errors, see notes in report.
	// ===========================================================================
	it("OBSERVE: throwing agent_end subscriber is swallowed (does not reject prompt)", async () => {
		const streamFn = () => {
			const s = new MockAssistantStream();
			queueMicrotask(() =>
				s.push({ type: "done", reason: "stop", message: assistant([{ type: "text", text: "hi" }]) }),
			);
			return s;
		};
		const agent = new Agent({ streamFn, initialState: { model: createModel() } });
		agent.subscribe((event) => {
			if (event.type === "agent_end") throw new Error("boom");
		});
		let rejected: string | undefined;
		try {
			await agent.prompt("hello");
		} catch (e) {
			rejected = e instanceof Error ? e.message : String(e);
		}
		expect(rejected).toBeUndefined();
	});
});

void ({} as Agent);
