import { describe, expect, it } from "vitest";
import { validateHttpServerConfig } from "../src/core/mcp/http-config.ts";

describe("MCP Streamable HTTP config validation", () => {
	it("accepts type 'http' with a url", () => {
		const v = validateHttpServerConfig({ type: "http", url: "https://mcp.example.com/mcp" });
		expect(v.ok).toBe(true);
		expect(v.transport).toBe("http");
		expect(v.result?.url).toBe("https://mcp.example.com/mcp");
		expect(v.result?.headers).toEqual({});
	});

	it("accepts the 'streamableHttp' alias and normalizes transport", () => {
		const v = validateHttpServerConfig({ type: "streamableHttp", url: "http://localhost:8080/mcp" });
		expect(v.ok).toBe(true);
		expect(v.transportAlias).toBe("streamableHttp");
		expect(v.transport).toBe("http");
	});

	it("rejects a missing type (config error)", () => {
		const v = validateHttpServerConfig({ url: "https://example.com/mcp" });
		expect(v.ok).toBe(false);
		expect(v.error).toContain("type");
	});

	it("rejects a missing url", () => {
		const v = validateHttpServerConfig({ type: "http" });
		expect(v.ok).toBe(false);
		expect(v.error).toContain("url");
	});

	it("rejects a non-http url scheme", () => {
		const v = validateHttpServerConfig({ type: "http", url: "ftp://example.com/mcp" });
		expect(v.ok).toBe(false);
		expect(v.error).toContain("http");
	});

	it("clearly rejects the deprecated sse transport", () => {
		const v = validateHttpServerConfig({ type: "sse", url: "https://example.com/events" });
		expect(v.ok).toBe(false);
		expect(v.transport).toBe("unsupported");
		expect(v.error).toMatch(/SSE/i);
		expect(v.error).toMatch(/NOT shipped/i);
	});

	it("parses headers and requires string values", () => {
		const v = validateHttpServerConfig({
			type: "http",
			url: "https://example.com/mcp",
			headers: { Authorization: "Bearer abc" },
		});
		expect(v.ok).toBe(true);
		expect(v.result?.headers.Authorization).toBe("Bearer abc");

		const bad = validateHttpServerConfig({
			type: "http",
			url: "https://example.com/mcp",
			headers: { Authorization: 42 },
		});
		expect(bad.ok).toBe(false);
	});

	it("parses oauth object (clientId/scope) and treats oauth:true as browser flow", () => {
		const v = validateHttpServerConfig({
			type: "http",
			url: "https://example.com/mcp",
			oauth: { clientId: "abc", scope: "read write" },
		});
		expect(v.ok).toBe(true);
		expect(v.result?.oauth?.clientId).toBe("abc");
		expect(v.result?.oauth?.scope).toBe("read write");

		const noOauth = validateHttpServerConfig({ type: "http", url: "https://example.com/mcp" });
		expect(noOauth.result?.oauth).toBeUndefined();
	});
});
