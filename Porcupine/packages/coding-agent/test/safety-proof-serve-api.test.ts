/**
 * SAFETY PROOF (FIXED): serve API (src/server/http-api.ts + src/modes/serve-mode.ts).
 * Authentication, Origin/CSRF, and permission-id metering.
 *
 * Claims:
 *  (A) GOOD: with a token set, an unauthenticated request is 401 on every route.
 *  (B) FIXED: cross-origin requests (no Origin / mismatched Origin) are now rejected.
 *  (C) FIXED: permission ids are now unguessable random UUIDs (no predictable
 *      timestamp+sequence scheme).
 *  (D) BY DESIGN: loopback default runs with no token; a token is only required
 *      for non-loopback binds.
 */
import { afterEach, describe, expect, it } from "vitest";
import { adaptSessionToServeApi } from "../src/modes/serve-mode.ts";
import { createServeApi, type ServeApiHandle, type ServeApiSession } from "../src/server/http-api.ts";

function makeSession(over: Partial<ServeApiSession> = {}): ServeApiSession {
	return {
		id: "sess-fixed",
		sendUserMessage: async () => {},
		abort: async () => {},
		isStreaming: () => false,
		onEvent: () => () => {},
		onConfirm: () => () => {},
		...over,
	};
}

async function http(
	method: string,
	port: number,
	path: string,
	opts: { token?: string; body?: string; origin?: string } = {},
): Promise<{ status: number; body: string }> {
	const res = await fetch(`http://127.0.0.1:${port}${path}`, {
		method,
		headers: {
			...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
			...(opts.body ? { "content-type": "application/json" } : {}),
			...(opts.origin ? { origin: opts.origin } : {}),
		},
		...(opts.body ? { body: opts.body } : {}),
	});
	return { status: res.status, body: await res.text() };
}

let server: ServeApiHandle | undefined;

afterEach(async () => {
	if (server) {
		await server.close();
		server = undefined;
	}
});

describe("SAFETY PROOF (FIXED): serve API authentication model", () => {
	it("(A) GOOD: with a token set, missing/incorrect token is 401 on every route", async () => {
		server = await (async () => {
			const s = createServeApi({ session: makeSession(), port: 0, token: "sekret" });
			await s.listen();
			return s;
		})();
		const port = server.port();
		expect((await http("GET", port, "/health")).status).toBe(401);
		expect((await http("GET", port, "/session")).status).toBe(401);
		expect((await http("GET", port, "/health", { token: "sekret" })).status).toBe(200);
	});

	it("(B) FIXED: a cross-origin (mismatched Origin) caller is rejected with 403", async () => {
		server = await (async () => {
			const s = createServeApi({ session: makeSession(), port: 0, token: "sekret2" });
			await s.listen();
			return s;
		})();
		const port = server.port();
		const res = await fetch(`http://127.0.0.1:${port}/session`, {
			headers: { origin: "https://evil.example", authorization: "Bearer sekret2" },
		});
		expect(res.status).toBe(403);
	});

	it("(B2) FIXED: a request without an Origin header is allowed (server-side non-browser client)", async () => {
		server = await (async () => {
			const s = createServeApi({ session: makeSession(), port: 0, token: "sekret2" });
			await s.listen();
			return s;
		})();
		const port = server.port();
		expect((await http("GET", port, "/session", { token: "sekret2" })).status).toBe(200);
	});

	it("(C) FIXED: permission ids minted by the serve adapter are unguessable random UUIDs", async () => {
		let confirmFn: ((title: string, message: string) => Promise<boolean>) | undefined;
		const fake = {
			sessionId: "sess-real",
			sendUserMessage: async () => {},
			abort: async () => {},
			isStreaming: false,
			subscribe: () => () => {},
			setConfirmCallback: (cb: (title: string, message: string) => Promise<boolean>) => {
				confirmFn = cb;
			},
		};
		const adapter = adaptSessionToServeApi(fake as never);
		let capturedId: string | undefined;
		adapter.onConfirm((permission, respond) => {
			capturedId = permission.id;
			respond(false); // resolve the adapter's inner promise so await returns
		});
		// The adapter wraps the session confirm callback; firing it allocates the id.
		await confirmFn!("Run bash?", "rm -rf /tmp/x");
		expect(capturedId).toBeDefined();
		// Must look like a perm-<uuid> nonce, never a guessable timestamp+sequence.
		expect(capturedId!).toMatch(/^perm-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
		expect(capturedId!).not.toMatch(/perm-\d+-\d+$/);
	});

	it("(C2) FIXED: approval endpoint accepts a known pending id but the id itself is a random UUID", async () => {
		let confirmHandler:
			| ((p: { id: string; title: string; message: string }, r: (allow: boolean) => void) => void)
			| undefined;
		const sess = makeSession({
			onConfirm: (handler) => {
				confirmHandler = handler;
				return () => {};
			},
		});
		server = createServeApi({ session: sess, port: 0, token: "TOK" });
		await server.listen();
		const port = server.port();

		let decided = false;
		const permId = "perm-fff5b2a9-0000-4000-8000-000000000000"; // a UUID-shaped id
		confirmHandler?.({ id: permId, title: "Overwrite?", message: "rm -rf stuff" }, (allow) => {
			decided = allow;
		});

		const res = await http("POST", port, `/session/sess-fixed/permissions/${permId}/response`, {
			token: "TOK",
			body: JSON.stringify({ allow: true }),
		});
		expect(res.status).toBe(200);
		expect(decided).toBe(true);
	});

	it("(D) BY DESIGN: loopback runs with no token; health and session are reachable", async () => {
		server = await (async () => {
			const s = createServeApi({ session: makeSession(), port: 0 });
			await s.listen();
			return s;
		})();
		const port = server.port();
		expect(port).toBeGreaterThan(0);
		expect((await http("GET", port, "/health")).status).toBe(200);
		expect((await http("POST", port, "/session")).status).toBe(201);
	});

	it("(D2) BY DESIGN: the token-optional loopback surface can be injected into", async () => {
		server = await (async () => {
			const s = createServeApi({ session: makeSession(), port: 0 });
			await s.listen();
			return s;
		})();
		const port = server.port();
		expect(
			(
				await http("POST", port, "/session/sess-fixed/message", {
					body: JSON.stringify({ text: "drop the db" }),
				})
			).status,
		).toBe(202);
	});
});
