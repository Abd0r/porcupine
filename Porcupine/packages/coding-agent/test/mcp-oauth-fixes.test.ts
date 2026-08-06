import { mkdtempSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { McpOAuthFileCache } from "../src/core/mcp/oauth.ts";
import { BrowserOAuthProvider, captureAuthorizationCode, OAUTH_CALLBACK_PORT } from "../src/core/mcp/oauth-browser.ts";

// Never launch a real browser in tests: openBrowser (execFile) always rejects,
// exercising the callback-server error-close path deterministically.
vi.mock("child_process", () => ({
	execFile: async () => {
		throw new Error("browser unavailable (mocked)");
	},
}));

function tempDir(prefix: string): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

/** Resolve true when the well-known port can be freshly bound (i.e. is released). */
function isPortFree(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const s: Server = createServer();
		s.on("error", () => resolve(false));
		s.listen(port, "127.0.0.1", () => s.close(() => resolve(true)));
	});
}

describe("MCP callback server — can never leak port 37238 (findings 2 + 6 + 5)", () => {
	it("rejects with a clear EADDRINUSE message when the port is already bound", async () => {
		const blocker = createServer();
		await new Promise<void>((r) => blocker.listen(OAUTH_CALLBACK_PORT, "127.0.0.1", r));
		try {
			const capture = captureAuthorizationCode(OAUTH_CALLBACK_PORT);
			await expect(capture.promise).rejects.toThrow("OAuth callback port 37238 is in use");
		} finally {
			await new Promise<void>((r) => blocker.close(() => r()));
		}
	});

	it("abort() releases the bound port so a follow-up attempt does not EADDRINUSE", async () => {
		const capture = captureAuthorizationCode(OAUTH_CALLBACK_PORT);
		capture.abort();
		// Give Node a tick to actually close the bound listener.
		await new Promise((r) => setTimeout(r, 50));
		expect(await isPortFree(OAUTH_CALLBACK_PORT)).toBe(true);
	});

	it("closes the callback server when the browser cannot be opened (openBrowser failure)", async () => {
		// Make `execFile` (used by openBrowser) reject → redirectToAuthorization:
		// (1) `await openBrowser(...)` throws, (2) the catch calls abort() which
		// closes the callback server, (3) the rejection propagates.
		const cache = new McpOAuthFileCache(tempDir("porcupine-browser-close-"));
		const provider = new BrowserOAuthProvider("srv", cache);
		await expect(provider.redirectToAuthorization(new URL("https://example.com/oauth/auth"))).rejects.toThrow();
		await new Promise((r) => setTimeout(r, 50));
		expect(await isPortFree(OAUTH_CALLBACK_PORT)).toBe(true);
	});
});

describe("MCP OAuth keyring cache — token survives a silent keychain write failure (finding 3)", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it("writes the full token to the 0600 fallback file when the keychain write rejects", async () => {
		// Mock the keyring module so writeSecret rejects (backend transiently down),
		// while hasKeychain stays functional.
		vi.doMock("../src/core/keyring.ts", async (importOriginal) => {
			const actual = await importOriginal<typeof import("../src/core/keyring.ts")>();
			return {
				...actual,
				writeSecret: vi.fn().mockRejectedValue(new Error("keychain down")),
			};
		});
		const { McpOAuthKeyringCache: KeyringCache } = await import("../src/core/mcp/oauth.ts");

		const dir = tempDir("porcupine-keychain-fallback-");
		const cache = new KeyringCache(dir);
		// Simulate that load() had already probed a working keychain.
		(cache as unknown as { keychainReady: boolean }).keychainReady = true;

		cache.set("srv", { access_token: "must-survive", token_type: "bearer" } as never);
		// Let the fire-and-forget keychain write settle (and trigger the fallback).
		await new Promise((r) => setTimeout(r, 30));

		// The full token must now be readable from the 0600 fallback file after restart.
		const fresh = new McpOAuthFileCache(dir);
		expect(fresh.get("srv")?.access_token).toBe("must-survive");
	});
});
