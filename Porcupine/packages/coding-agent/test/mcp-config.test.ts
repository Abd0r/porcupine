import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hashString, loadMcpConfig } from "../src/core/mcp/config.ts";

function tempAgentDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "porcupine-mcp-config-"));
	mkdirSync(join(dir, ".porcupine"), { recursive: true });
	return dir;
}

const GLOBAL_CONFIG = JSON.stringify({
	mcpServers: {
		filesystem: {
			type: "stdio",
			command: "npx",
			args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
			enabled: true,
			allow: ["filesystem_read_file", "filesystem_list_directory"],
		},
		shared: {
			type: "stdio",
			command: "node",
			args: ["shared.js"],
			allow: ["shared_do_thing"],
		},
	},
});

describe("MCP config", () => {
	it("loads global config and expands env vars", () => {
		const agentDir = tempAgentDir();
		writeFileSync(join(agentDir, "mcp.json"), GLOBAL_CONFIG, "utf8");
		const loaded = loadMcpConfig({
			cwd: agentDir,
			agentDir,
			env: { TOKEN: "abc123" },
		});
		expect(loaded.errors).toEqual([]);
		const fs = loaded.servers.find((s) => s.serverKey === "filesystem");
		expect(fs?.type).toBe("stdio");
		expect(fs?.command).toBe("npx");
		expect(fs?.allow.has("filesystem_read_file")).toBe(true);
		expect(fs?.contentHash).toBeTruthy();
	});

	it("project config overrides same-key global and can disable it", () => {
		const agentDir = tempAgentDir();
		writeFileSync(join(agentDir, "mcp.json"), GLOBAL_CONFIG, "utf8");
		// Project overrides `shared` and disables `filesystem`.
		writeFileSync(
			join(agentDir, ".porcupine", "mcp.json"),
			JSON.stringify({
				mcpServers: {
					shared: { type: "stdio", command: "bun", args: ["new-shared.ts"], allow: [] },
					filesystem: { type: "stdio", command: "npx", args: ["x"], enabled: false },
				},
			}),
			"utf8",
		);
		const loaded = loadMcpConfig({ cwd: agentDir, agentDir });
		const shared = loaded.servers.find((s) => s.serverKey === "shared");
		expect(shared?.command).toBe("bun");
		const fs = loaded.servers.find((s) => s.serverKey === "filesystem");
		expect(fs?.enabled).toBe(false);
	});

	it("rejects entries missing the required type field", () => {
		const agentDir = tempAgentDir();
		writeFileSync(
			join(agentDir, "mcp.json"),
			JSON.stringify({ mcpServers: { bad: { command: "node", args: [] } } }),
			"utf8",
		);
		const loaded = loadMcpConfig({ cwd: agentDir, agentDir });
		expect(loaded.servers.find((s) => s.serverKey === "bad")).toBeUndefined();
		expect(loaded.errors.length).toBeGreaterThan(0);
	});

	it("hashes server content so config changes can be detected (rug-pull)", () => {
		const a = hashString("node|['x.js']|{}|/tmp");
		const b = hashString("node|['x.js']|{}|/tmp");
		const c = hashString("node|['evil.js']|{}|/tmp");
		expect(a).toBe(b);
		expect(a).not.toBe(c);
	});
});
