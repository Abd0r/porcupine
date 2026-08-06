import { describe, expect, it } from "vitest";
import { formatMcpStatusLine } from "../src/core/mcp/commands.ts";
import type { McpServerStatus } from "../src/core/mcp/types.ts";

function status(overrides: Partial<McpServerStatus>): McpServerStatus {
	return {
		serverKey: "sentry",
		scope: "global",
		health: "connected",
		toolCount: 3,
		resourceCount: 1,
		promptCount: 2,
		transport: "http",
		enabled: true,
		...overrides,
	};
}

describe("/mcp status formatting", () => {
	it("includes transport and tool counts", () => {
		const line = formatMcpStatusLine(status({}));
		expect(line).toContain("sentry");
		expect(line).toContain("/http");
		expect(line).toContain("connected");
		expect(line).toContain("3 tool(s)");
	});

	it("shows resource and prompt counts when non-zero", () => {
		const line = formatMcpStatusLine(status({ resourceCount: 4, promptCount: 5 }));
		expect(line).toContain("4 resource(s)");
		expect(line).toContain("5 prompt(s)");
	});

	it("shows oauth state when present", () => {
		const line = formatMcpStatusLine(status({ oauthState: "auth_required" }));
		expect(line).toContain("oauth:auth_required");
	});

	it("marks disabled servers", () => {
		const line = formatMcpStatusLine(status({ enabled: false, health: "disabled" }));
		expect(line).toContain("disabled");
	});
});
