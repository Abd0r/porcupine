import type { AgentMessage } from "@porcupineai/agent-core";
import type { AssistantMessage } from "@porcupineai/ai";
import { describe, expect, it } from "vitest";
import { extractTaskRunResultText } from "../src/modes/interactive/interactive-mode.ts";

function assistant(content: AssistantMessage["content"], overrides: Partial<AssistantMessage> = {}): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "test-api",
		provider: "test-provider",
		model: "test-model",
		usage: {
			input: 1,
			output: 1,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 2,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: Date.now(),
		...overrides,
	};
}

describe("extractTaskRunResultText", () => {
	it("returns the text of the last assistant message", () => {
		const messages: AgentMessage[] = [
			assistant([{ type: "text", text: "Older turn" }]),
			assistant([{ type: "text", text: "  Fixed the failing test suite: 12 passed.  " }]),
		];
		expect(extractTaskRunResultText(messages)).toBe("Fixed the failing test suite: 12 passed.");
	});

	it("walks past text-less assistant turns to the latest text result", () => {
		const messages: AgentMessage[] = [
			assistant([{ type: "text", text: "Previous task result" }]),
			assistant([{ type: "toolCall", id: "t1", name: "read", arguments: { path: "x" } }]),
			assistant([{ type: "text", text: "Final summary here" }]),
		];
		expect(extractTaskRunResultText(messages)).toBe("Final summary here");
	});

	it("returns empty when the latest assistant turn has no text", () => {
		const messages: AgentMessage[] = [
			assistant([{ type: "toolCall", id: "t1", name: "bash", arguments: { command: "ls" } }]),
		];
		expect(extractTaskRunResultText(messages)).toBe("");
	});

	it("handles undefined and empty message lists", () => {
		expect(extractTaskRunResultText(undefined)).toBe("");
		expect(extractTaskRunResultText([])).toBe("");
	});

	it("caps long results at 2000 chars", () => {
		const long = "x".repeat(5000);
		expect(extractTaskRunResultText([assistant([{ type: "text", text: long }])])).toHaveLength(2000);
	});
});
