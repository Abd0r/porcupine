import { existsSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createOAuthProvider, McpOAuthFileCache } from "../src/core/mcp/oauth.ts";

function tempCache(): McpOAuthFileCache {
	const dir = mkdtempSync(join(tmpdir(), "porcupine-mcp-oauth-"));
	return new McpOAuthFileCache(dir);
}

describe("MCP OAuth token cache", () => {
	it("round-trips tokens per server", () => {
		const cache = tempCache();
		expect(cache.has("srv")).toBe(false);
		cache.set("srv", { access_token: "ab", token_type: "Bearer", scope: "read" } as never);
		expect(cache.has("srv")).toBe(true);
		expect(cache.get("srv")?.access_token).toBe("ab");
	});

	it("is isolated per server key", () => {
		const cache = tempCache();
		cache.set("a", { access_token: "tok-a", token_type: "Bearer" } as never);
		expect(cache.has("b")).toBe(false);
	});

	it("persists to disk with 0600 permissions", () => {
		const dir = mkdtempSync(join(tmpdir(), "porcupine-mcp-oauth-perm-"));
		const cache = new McpOAuthFileCache(dir);
		cache.set("srv", { access_token: "tok", token_type: "Bearer" } as never);
		cache.set("srv", { access_token: "tok2", token_type: "Bearer" } as never);
		cache.flush();

		const cacheFile = join(dir, "mcp-oauth.json");
		expect(existsSync(cacheFile)).toBe(true);
		// 0600 → mode & 0o777 === 0o600.
		expect(statSync(cacheFile).mode & 0o777).toBe(0o600);

		// Fresh cache instance reads the persisted tokens back.
		const fresh = new McpOAuthFileCache(dir);
		expect(fresh.get("srv")?.access_token).toBe("tok2");
	});

	it("flushes pending writes", () => {
		const dir = mkdtempSync(join(tmpdir(), "porcupine-mcp-oauth-flush-"));
		const cache = new McpOAuthFileCache(dir);
		cache.set("srv", { access_token: "x", token_type: "Bearer" } as never);
		cache.flush();
		expect(existsSync(join(dir, "mcp-oauth.json"))).toBe(true);
		expect(statSync(join(dir, "mcp-oauth.json")).mode & 0o777).toBe(0o600);
	});

	it("remove clears a server", () => {
		const cache = tempCache();
		cache.set("srv", { access_token: "x", token_type: "Bearer" } as never);
		cache.remove("srv");
		expect(cache.has("srv")).toBe(false);
	});
});

describe("MCP OAuth provider factory classification", () => {
	it("clientId+clientSecret → client_credentials, not auth_required", () => {
		const cache = tempCache();
		const decision = createOAuthProvider("srv", { clientId: "id", clientSecret: "sec", scope: "read" }, cache);
		expect(decision.kind).toBe("client_credentials");
		expect(decision.provider).toBeTruthy();
		expect(decision.authRequired).toBe(false);
	});

	it("clientId+privateKey → private_key_jwt", () => {
		const cache = tempCache();
		const decision = createOAuthProvider("srv", { clientId: "id", privateKey: "PEM", algorithm: "RS256" }, cache);
		expect(decision.kind).toBe("private_key_jwt");
		expect(decision.authRequired).toBe(false);
	});

	it("oauth:true (no credentials) → browser flow flagged auth_required", () => {
		const cache = tempCache();
		const decision = createOAuthProvider("srv", {}, cache);
		// empty oauth object with no creds → not auth_required (no scope/id either)
		expect(decision.authRequired).toBe(false);

		const withScope = createOAuthProvider("srv", { scope: "read" }, cache);
		expect(withScope.kind).toBe("browser");
		expect(withScope.authRequired).toBe(true);
	});

	it("no oauth config → no provider, not auth_required", () => {
		const cache = tempCache();
		const decision = createOAuthProvider("srv", undefined, cache);
		expect(decision.provider).toBeUndefined();
		expect(decision.authRequired).toBe(false);
	});

	it("credential provider seeds from an existing cache token", async () => {
		const dir = mkdtempSync(join(tmpdir(), "porcupine-mcp-oauth-seed-"));
		const cache = new McpOAuthFileCache(dir);
		cache.set("srv", { access_token: "persisted", token_type: "Bearer" } as never);
		const decision = createOAuthProvider("srv", { clientId: "id", clientSecret: "sec" }, cache);
		const cached = await decision.provider?.tokens?.();
		expect(cached?.access_token).toBe("persisted");
	});
});
