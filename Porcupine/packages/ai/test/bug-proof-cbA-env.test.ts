import { afterEach, describe, expect, it, vi } from "vitest";
import { resetApiProviders, stream } from "../src/compat.ts";
import { CLINE_MODELS } from "../src/providers/cline.ts";
import { DEEPSEEK_MODELS } from "../src/providers/deepseek.models.ts";
import type { Context, FetchFunction } from "../src/types.ts";

const context: Context = {
	messages: [{ role: "user", content: "hello", timestamp: 1 }],
};

// Minimal OpenAI-completions streaming response; captures the Authorization header.
function captureFetch() {
	const seen: string[] = [];
	const fetch = vi.fn<FetchFunction>(async (_url, init) => {
		const headers = new Headers((init as RequestInit | undefined)?.headers);
		seen.push(headers.get("authorization") ?? "");
		const body = JSON.stringify({
			id: "chatcmpl-test",
			object: "chat.completion.chunk",
			model: "test",
			choices: [
				{ index: 0, delta: { content: "hi" }, finish_reason: null },
				{ index: 0, delta: {}, finish_reason: "stop" },
			],
			usage: { prompt_tokens: 5, completion_tokens: 2 },
		});
		const encoder = new TextEncoder();
		const stream2 = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(encoder.encode(`data: ${body}\n\n`));
				controller.enqueue(encoder.encode("data: [DONE]\n\n"));
				controller.close();
			},
		});
		return new Response(stream2, {
			status: 200,
			headers: { "content-type": "text/event-stream" },
		});
	});
	return { fetch, seen };
}

afterEach(() => {
	resetApiProviders();
});

describe("bug-proof-cbA: Cline env-key injection parity", () => {
	it("CLINE_API_KEY IS injected from options.env through compat stream() (FIXED)", async () => {
		const clineModel = CLINE_MODELS.find((m) => m.id === "deepseek/deepseek-chat")!;
		const { fetch, seen } = captureFetch();
		vi.stubGlobal(
			"fetch",
			vi.fn<FetchFunction>(async () => {
				throw new Error("ambient fetch must not be called");
			}),
		);

		const s = stream(clineModel, context, {
			env: { CLINE_API_KEY: "sk-cline-test" },
			fetch,
			maxTokens: 100,
			timeoutMs: 5000,
		});
		const result = await s.result();

		// FIXED: compat stream() now injects CLINE_API_KEY because getApiKeyEnvVars()
		// in src/env-api-keys.ts has a "cline" entry, so withEnvApiKey() sees it.
		// The upstream mock must observe the injected Authorization header. (The mock
		// stream body is not a full Cline-completions stream, so stopReason is not
		// asserted - same as the deepseek control below.)
		expect(seen.length).toBeGreaterThan(0);
		expect(seen[0]).toBe("Bearer sk-cline-test");
		expect(result.stopReason).toBe("error");
	});

	it("control: DEEPSEEK_API_KEY IS injected from options.env through compat stream()", async () => {
		const dsModel = Object.values(DEEPSEEK_MODELS).find((m) => m.id === "deepseek-v4-flash")!;
		const { fetch, seen } = captureFetch();
		vi.stubGlobal(
			"fetch",
			vi.fn<FetchFunction>(async () => {
				throw new Error("ambient fetch must not be called");
			}),
		);

		const s = stream(dsModel, context, {
			env: { DEEPSEEK_API_KEY: "sk-ds-test" },
			fetch,
			maxTokens: 100,
			timeoutMs: 5000,
		});
		await s.result();

		// Assert upstream observed the injected key (mock stream body is intentionally
		// not a full DeepSeek stream, so final stopReason is not asserted).
		expect(seen.length).toBeGreaterThan(0);
		expect(seen[0]).toBe("Bearer sk-ds-test");
	});
});
