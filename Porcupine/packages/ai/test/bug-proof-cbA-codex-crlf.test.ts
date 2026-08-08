import { describe, expect, it, vi } from "vitest";
import { stream } from "../src/api/openai-codex-responses.ts";
import type { Context, FetchFunction, Model } from "../src/types.ts";

const context: Context = {
	messages: [{ role: "user", content: "hello", timestamp: 1 }],
};

const model: Model<"openai-codex-responses"> = {
	id: "gpt-5.1-codex",
	name: "Codex",
	api: "openai-codex-responses",
	provider: "openai-codex",
	baseUrl: "https://mock.test/codex/responses",
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 100000,
	maxTokens: 1000,
};

// Dummy JWT with the Codex account-id claim so extractAccountId() passes.
function jwtToken(): string {
	const b64 = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString("base64url");
	const header = b64({ alg: "none", typ: "JWT" });
	const payload = b64({ "https://api.openai.com/auth": { chatgpt_account_id: "acc_test" } });
	return `${header}.${payload}.dummy`;
}

function codexResponseBody(delimiter: "\n\n" | "\r\n\r\n"): ReadableStream<Uint8Array> {
	const events = [
		{ type: "response.created", response: { id: "resp_1" } },
		{
			type: "response.output_item.added",
			output_index: 0,
			item: { type: "message", id: "msg_1", role: "assistant", status: "in_progress", content: [] },
		},
		{ type: "response.output_text.delta", output_index: 0, delta: "Hello" },
		{
			type: "response.output_item.done",
			output_index: 0,
			item: {
				type: "message",
				id: "msg_1",
				role: "assistant",
				status: "completed",
				content: [{ type: "output_text", text: "Hello", annotations: [] }],
			},
		},
		{
			type: "response.completed",
			response: {
				id: "resp_1",
				status: "completed",
				usage: {
					input_tokens: 10,
					output_tokens: 5,
					total_tokens: 15,
					input_tokens_details: {},
					output_tokens_details: {},
				},
			},
		},
	];
	const payload = events.map((e) => `data: ${JSON.stringify(e)}`).join(delimiter) + delimiter;
	const encoder = new TextEncoder();
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(encoder.encode(payload));
			controller.close();
		},
	});
}

function run(delimiter: "\n\n" | "\r\n\r\n") {
	const fetch = vi.fn<FetchFunction>(async () => {
		return new Response(codexResponseBody(delimiter), {
			status: 200,
			headers: { "content-type": "text/event-stream" },
		});
	});
	return stream(model, context, {
		apiKey: jwtToken(),
		transport: "sse", // force the raw SSE parseSSE path (not WebSocket)
		fetch,
		maxTokens: 100,
		timeoutMs: 5000,
		maxRetries: 0,
	}).result();
}

describe("bug-proof-cbA: openai-codex-responses parseSSE CRLF handling", () => {
	it("parses SSE events split with LF-only delimiters", async () => {
		const result = await run("\n\n");
		expect(result.stopReason).toBe("stop");
		const text = result.content
			.filter((b) => b.type === "text")
			.map((b) => (b as { text: string }).text)
			.join("");
		expect(text).toBe("Hello");
	});

	// BUG: parseSSE only splits on "\n\n" (src/api/openai-codex-responses.ts:786) and never
	// on "\r\n\r\n". SSE spec (RFC 8896) allows CRLF line endings, which many HTTP/2 SSE
	// implementations emit. With CRLF the delimiter index is never found, so no event is
	// parsed and the stream ends with no terminal event -> "stream ended before a terminal
	// response event" / stopReason "error".
	it("parses SSE events split with CRLF delimiters (RFC 8896 allows \\r\\n)", async () => {
		const result = await run("\r\n\r\n");
		expect(result.stopReason).toBe("stop");
		const text = result.content
			.filter((b) => b.type === "text")
			.map((b) => (b as { text: string }).text)
			.join("");
		expect(text).toBe("Hello");
	});
});
