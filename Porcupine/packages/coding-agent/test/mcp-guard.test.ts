import { describe, expect, it } from "vitest";
import {
	createMcpToolGuard,
	InMemoryMcpApprovalStore,
	isHardlineMcpCall,
	type McpToolGuard,
} from "../src/core/mcp/security.ts";
import type { ResolvedMcpServer } from "../src/core/mcp/types.ts";

function server(overrides: Partial<ResolvedMcpServer> = {}): ResolvedMcpServer {
	return {
		serverKey: "filesystem",
		scope: "global",
		baseDir: "/tmp",
		type: "stdio",
		url: "",
		command: "npx",
		args: ["server.js"],
		env: {},
		headers: {},
		cwd: "/tmp",
		enabled: true,
		allow: new Set<string>(),
		timeoutMs: 60000,
		contentHash: "hash-a",
		...overrides,
	};
}

function makeGuard(
	overrides: { confirm?: (t: string, m: string) => Promise<boolean>; store?: InMemoryMcpApprovalStore } = {},
): McpToolGuard {
	const store = overrides.store ?? new InMemoryMcpApprovalStore();
	return createMcpToolGuard({
		modelRuntime: undefined as never,
		model: () => undefined,
		confirm: overrides.confirm,
		approvalStore: store,
	});
}

const ctx = (
	s: ResolvedMcpServer,
	name: string,
	mode: "ask" | "normal" | "auto",
	args: Record<string, unknown> = {},
) => ({
	mode,
	server: s,
	mcpToolName: name,
	agentToolName: `${s.serverKey}_${name}`,
	arguments: args,
});

describe("MCP tool guard", () => {
	it("fails closed with no confirm callback", async () => {
		const guard = makeGuard();
		const decision = await guard.guard(ctx(server(), "read_file", "normal"));
		expect(decision.approved).toBe(false);
		expect(decision.via).toBe("error");
	});

	it("denies hardline destructive calls in ALL modes", async () => {
		const guard = makeGuard({ confirm: async () => true });
		for (const mode of ["ask", "normal", "auto"] as const) {
			const decision = await guard.guard(ctx(server(), "exec", mode, { command: "rm -rf /tmp/example" }));
			expect(decision.approved).toBe(false);
			expect(decision.via).toBe("hardline");
		}
	});

	it("runs allowlisted tools directly in normal and auto modes", async () => {
		const guard = makeGuard({ confirm: async () => true });
		const s = server({ allow: new Set(["read_file"]) });
		for (const mode of ["normal", "auto"] as const) {
			const decision = await guard.guard(ctx(s, "read_file", mode, { path: "/tmp/x" }));
			expect(decision.approved).toBe(true);
			expect(decision.via).toBe("allowlist");
		}
	});

	it("asks the user in ask mode and in normal mode for non-allowlisted tools", async () => {
		const confirmCalls: string[] = [];
		const guard = makeGuard({
			confirm: async (title) => {
				confirmCalls.push(title);
				return true;
			},
		});
		const askDecision = await guard.guard(ctx(server(), "write_file", "ask", { path: "/tmp/x" }));
		expect(askDecision.approved).toBe(true);
		expect(askDecision.via).toBe("manual");
		const normalDecision = await guard.guard(ctx(server(), "write_file", "normal", { path: "/tmp/x" }));
		expect(normalDecision.approved).toBe(true);
		expect(normalDecision.via).toBe("manual");
		expect(confirmCalls.length).toBe(2);
	});

	it("rejects a server whose content hash changed after approval (rug-pull)", async () => {
		const store = new InMemoryMcpApprovalStore();
		store.approve("filesystem", "hash-a");
		const guard = makeGuard({ store, confirm: async () => false });
		// Same server key, different hash — prior approval must not carry over.
		const decision = await guard.guard(ctx(server({ contentHash: "hash-evil" }), "read_file", "auto"));
		expect(decision.approved).toBe(false);
	});
});

describe("MCP hardline detection", () => {
	it("catches credential reads and destructive SQL", () => {
		expect(isHardlineMcpCall("exec", { command: "cat ~/.ssh/id_rsa" })).toContain("credential");
		expect(isHardlineMcpCall("run_sql", { query: "DROP TABLE users" })).toContain("SQL");
		expect(isHardlineMcpCall("format", {})).toContain("tool name");
	});

	it("allows benign calls", () => {
		expect(isHardlineMcpCall("read_file", { path: "/tmp/readme.md" })).toBeUndefined();
	});
});
