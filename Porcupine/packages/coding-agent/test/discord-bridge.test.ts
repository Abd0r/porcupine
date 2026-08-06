import { afterEach, describe, expect, it, vi } from "vitest";
import { DiscordBridge } from "../src/porcupine/discord-bridge.ts";

/**
 * Discord bridge smoke tests — no real gateway. REST is served by a fetch mock;
 * handleMessage / handleAgentEnd are exercised directly (private via `any`).
 */
function createFetchMock() {
	const calls: Array<{ path: string; method: string; body?: string }> = [];
	const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
		const url = String(input);
		const path = url.replace("https://discord.com/api/v10", "");
		calls.push({ path, method: init?.method ?? "GET", body: String(init?.body ?? "") });
		return {
			ok: true,
			status: 200,
			json: async () => ({ id: "sent-message-1" }),
		} as Response;
	};
	return { fetchImpl, calls };
}

afterEach(() => {
	vi.restoreAllMocks();
});

function makeBridge(overrides: Partial<ConstructorParameters<typeof DiscordBridge>[0]> = {}) {
	const { fetchImpl, calls } = createFetchMock();
	const prompts: string[] = [];
	const bridge = new DiscordBridge({
		token: "test-token",
		allowlist: ["channel-1"],
		prompt: async (text) => {
			prompts.push(text);
		},
		...overrides,
	});
	// Swap the global fetch used by rest().
	(globalThis as { fetch: typeof fetch }).fetch = fetchImpl as unknown as typeof fetch;
	return { bridge, calls, prompts, fetchImpl };
}

function assistantMessage(text: string, userPrompt: string) {
	return [
		{ role: "user" as const, content: [{ type: "text" as const, text: userPrompt }] },
		{
			role: "assistant" as const,
			content: [{ type: "text" as const, text }],
			stopReason: "end_turn",
		},
	];
}

describe("DiscordBridge", () => {
	it("prompts the session for allowed-channel messages and skips self/bots", async () => {
		const { bridge, prompts } = makeBridge();
		const anyBridge = bridge as unknown as {
			handleMessage(message: unknown): Promise<void>;
			selfId?: string;
		};

		await anyBridge.handleMessage({
			id: "m1",
			channel_id: "channel-1",
			author: { id: "user-1", bot: false },
			content: "  hello there  ",
		});
		expect(prompts).toEqual(["hello there"]);

		// Bot messages and messages from ourselves never prompt.
		await anyBridge.handleMessage({
			id: "m2",
			channel_id: "channel-1",
			author: { id: "bot-1", bot: true },
			content: "ignore me",
		});
		anyBridge.selfId = "me";
		await anyBridge.handleMessage({
			id: "m3",
			channel_id: "channel-1",
			author: { id: "me", bot: false },
			content: "ignore me too",
		});
		expect(prompts).toHaveLength(1);
	});

	it("does not prompt for channels outside the allowlist", async () => {
		const { bridge, prompts } = makeBridge();
		const anyBridge = bridge as unknown as { handleMessage(message: unknown): Promise<void> };
		await anyBridge.handleMessage({
			id: "m1",
			channel_id: "channel-9",
			author: { id: "user-1" },
			content: "hello",
		});
		expect(prompts).toHaveLength(0);
	});

	it("forwards the response only to the channel whose turn just ended (provenance match)", async () => {
		const { bridge, calls, prompts } = makeBridge();
		const anyBridge = bridge as unknown as { handleMessage(message: unknown): Promise<void> };

		await anyBridge.handleMessage({
			id: "m1",
			channel_id: "channel-1",
			author: { id: "user-1" },
			content: "list the docs",
		});
		expect(prompts).toHaveLength(1);

		// Simulate the agent turn ending with the SAME last user text.
		await (
			bridge as unknown as { handleAgentEnd(messages: unknown[], willRetry: boolean): Promise<void> }
		).handleAgentEnd(assistantMessage("Here are the docs.", "list the docs"), false);

		const send = calls.find((call) => call.path.startsWith("/channels/channel-1/messages"));
		expect(send).toBeDefined();
		expect(JSON.parse(send!.body!).content).toContain("Here are the docs.");
	});

	it("a retry turn is never forwarded", async () => {
		const { bridge, calls, prompts } = makeBridge();
		const anyBridge = bridge as unknown as { handleMessage(message: unknown): Promise<void> };
		await anyBridge.handleMessage({
			id: "m1",
			channel_id: "channel-1",
			author: { id: "user-1" },
			content: "fix the build",
		});
		expect(prompts).toHaveLength(1);

		await (
			bridge as unknown as { handleAgentEnd(messages: unknown[], willRetry: boolean): Promise<void> }
		).handleAgentEnd(assistantMessage("retrying…", "fix the build"), true);

		expect(calls.some((call) => call.path.startsWith("/channels/channel-1/messages"))).toBe(false);
	});
});
