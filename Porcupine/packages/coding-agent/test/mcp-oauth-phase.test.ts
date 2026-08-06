import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { deleteSecret, readSecret, writeSecret } from "../src/core/keyring.ts";
import { McpOAuthFileCache, McpOAuthKeyringCache } from "../src/core/mcp/oauth.ts";
import { BrowserOAuthProvider } from "../src/core/mcp/oauth-browser.ts";
import { createMcpResourcesToolDefinition } from "../src/core/tools/mcp-resources.ts";

function tempDir(prefix: string): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

describe("OS keyring (Phase: keyring)", () => {
	it("round-trips a secret through the keychain or file fallback", async () => {
		const dir = tempDir("porcupine-keyring-");
		const service = "porcupine-test";
		const account = `acct-${Date.now()}`;
		await writeSecret(dir, service, account, "super-secret-token");
		expect(await readSecret(dir, service, account)).toBe("super-secret-token");
		await deleteSecret(dir, service, account);
		expect(await readSecret(dir, service, account)).toBeUndefined();
	});
});

describe("MCP OAuth keyring cache", () => {
	it("stores and retrieves tokens via memory + fallback", async () => {
		const dir = tempDir("porcupine-oauth-cache-");
		const cache = new McpOAuthKeyringCache(dir);
		await cache.load();
		expect(cache.has("fs-server")).toBe(false);
		cache.set("fs-server", { access_token: "abc", token_type: "bearer" });
		expect(cache.get("fs-server")?.access_token).toBe("abc");
		cache.remove("fs-server");
		expect(cache.has("fs-server")).toBe(false);
	});

	it("keeps the 0600 file as index + fallback when the keychain is absent", async () => {
		const dir = tempDir("porcupine-oauth-fallback-");
		const fileCache = new McpOAuthFileCache(dir);
		fileCache.set("srv", { access_token: "file-token", token_type: "bearer" });
		fileCache.flush();
		const keyringCache = new McpOAuthKeyringCache(dir);
		await keyringCache.load();
		expect(keyringCache.get("srv")?.access_token).toBe("file-token"); // fallback read-through
	});
});

describe("Browser OAuth provider (DCR + PKCE)", () => {
	it("exposes a public-client metadata + local redirect URL", () => {
		const cache = new McpOAuthFileCache(tempDir("porcupine-browser-"));
		const provider = new BrowserOAuthProvider("srv", cache);
		expect(String(provider.redirectUrl)).toContain("127.0.0.1");
		expect(provider.clientMetadata.redirect_uris).toContain(String(provider.redirectUrl));
		expect(provider.clientMetadata.token_endpoint_auth_method).toBe("none");
		expect(provider.clientMetadata.grant_types).toContain("authorization_code");
	});

	it("generates a fresh CSRF state per authorization", async () => {
		const provider = new BrowserOAuthProvider("srv", new McpOAuthFileCache(tempDir("porcupine-state-")));
		const s1 = await provider.state();
		const s2 = await provider.state();
		expect(s1).toBeTruthy();
		expect(s1).not.toBe(s2);
	});

	it("prepares an authorization_code token request with verifier + redirect", async () => {
		const cache = new McpOAuthFileCache(tempDir("porcupine-params-"));
		const provider = new BrowserOAuthProvider("srv", cache);
		await provider.saveCodeVerifier("pkce-verifier-123");
		(provider as unknown as { authorizationCode: string }).authorizationCode = "auth-code-xyz";
		const params = await provider.prepareTokenRequest();
		expect(params.get("grant_type")).toBe("authorization_code");
		expect(params.get("code")).toBe("auth-code-xyz");
		expect(params.get("code_verifier")).toBe("pkce-verifier-123");
		expect(params.get("redirect_uri")).toContain("127.0.0.1");
	});
});

describe("mcp_resources tool (resources → context)", () => {
	it("lists resources across servers and reads one into context", async () => {
		const tool = createMcpResourcesToolDefinition({
			list: async (serverKey) =>
				serverKey
					? [{ serverKey, uri: "file:///a.md", name: "a", description: "doc A" }]
					: [
							{ serverKey: "s1", uri: "file:///a.md", name: "a", description: "doc A" },
							{ serverKey: "s2", uri: "file:///b.md", name: "b", description: "doc B" },
						],
			read: async (serverKey, uri) =>
				serverKey === "s1" && uri === "file:///a.md"
					? { ok: true, text: "# Doc A\ncontent" }
					: { ok: false, error: "not found" },
		});

		const listResult = await tool.execute("id-1", { action: "list" }, undefined, undefined, undefined as never);
		const listText = listResult.content
			.filter((part) => part.type === "text")
			.map((part) => (part as { text?: string }).text ?? "")
			.join("\n");
		expect(listText).toContain("doc A");
		expect(listText).toContain("2");

		const readResult = await tool.execute(
			"id-2",
			{ action: "read", server: "s1", uri: "file:///a.md" },
			undefined,
			undefined,
			undefined as never,
		);
		const readText = readResult.content
			.filter((part) => part.type === "text")
			.map((part) => (part as { text?: string }).text ?? "")
			.join("\n");
		expect(readText).toContain("# Doc A");
	});
});
