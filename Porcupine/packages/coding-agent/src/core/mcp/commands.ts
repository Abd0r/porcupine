/**
 * MCP (Model Context Protocol) v1 client — /mcp slash command.
 *
 * Exposes a command handler the interactive mode can wire up (the interactive
 * layer is owned by the main agent; this module provides the handler +
 * description so wiring is a single call).
 *
 *   /mcp              → per-server health + tool counts
 *   /mcp status       → same as bare /mcp
 *   /mcp reload       → re-read config, diff start/stop, re-hash, refresh tools
 */

import type { McpManager } from "./manager.ts";
import type { McpServerStatus } from "./types.ts";

export interface McpCommandSpec {
	name: string;
	description: string;
	/** Set up argument completions if desired. */
	handler: (args: string) => Promise<string>;
}

function formatStatusLine(line: string, indent = "  "): string {
	return `${indent}${line}`;
}

function formatHealth(health: string, enabled: boolean): string {
	if (!enabled) return "disabled";
	switch (health) {
		case "connected":
			return "✓ connected";
		case "auth_required":
			return "🔑 auth_required";
		case "failed":
			return "✗ failed";
		default:
			return "disabled";
	}
}

/** Build the /mcp handler bound to a manager. Returns the formatted output. */
export async function handleMcpCommand(manager: McpManager, args: string): Promise<string> {
	const input = args.trim();
	const sub = input.split(/\s+/)[0]?.toLowerCase();

	if (sub === "reload" || sub === "r") {
		try {
			await manager.reload();
			return `MCP config reloaded.\n${await buildStatusTable(manager)}`;
		} catch (error) {
			return `MCP reload failed: ${error instanceof Error ? error.message : String(error)}`;
		}
	}

	if (sub === "auth" || sub === "a") {
		const serverKey = input.split(/\s+/)[1];
		if (!serverKey) return "Usage: /mcp auth <server>";
		return await manager.reauthenticate(serverKey);
	}

	// default and "status" both print the status table.
	return (
		(sub === "status" || sub === "s" || sub === "" ? "" : `Unknown /mcp subcommand: "${sub}"\n`) +
		(await buildStatusTable(manager))
	);
}

/**
 * Pure per-server status-line formatter (used by /mcp status and tests).
 * Width-agnostic one-line summary including transport, tool/resource/prompt
 * counts, and OAuth state when present.
 */
export function formatMcpStatusLine(s: McpServerStatus): string {
	const oauth = s.oauthState ? ` — oauth:${s.oauthState}` : "";
	const res = s.resourceCount > 0 ? ` — ${s.resourceCount} resource(s)` : "";
	const prm = s.promptCount > 0 ? ` — ${s.promptCount} prompt(s)` : "";
	return `  ${s.serverKey} (${s.scope}/${s.transport}) — ${formatHealth(s.health, s.enabled)} — ${s.toolCount} tool(s)${res}${prm}${oauth}`;
}

async function buildStatusTable(manager: McpManager): Promise<string> {
	const statuses = manager.getStatus();
	if (statuses.length === 0) {
		return "No MCP servers configured.\nAdd servers to ~/.porcupine/agent/mcp.json (global) or ./.porcupine/mcp.json (project).";
	}
	const lines: string[] = ["MCP servers:"];
	for (const s of statuses) {
		lines.push(formatMcpStatusLine(s));
		if (s.error) {
			lines.push(formatStatusLine(`  error: ${s.error}`, "    "));
		}
	}
	lines.push("\nTools are fail-closed: run only when on the server allow list or explicitly user-approved.");
	return lines.join("\n");
}

/**
 * Returns the /mcp command spec. Wire this into interactive mode's command
 * registration (main-agent owned). Returns null when no manager is attached.
 */
export function createMcpCommand(manager: McpManager | null | undefined): McpCommandSpec | null {
	if (!manager) return null;
	return {
		name: "mcp",
		description: "Show MCP server status and tool counts (reload to refresh)",
		handler: (args) => handleMcpCommand(manager, args),
	};
}
