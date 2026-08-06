/**
 * `mcp_resources` — MCP resources as loadable context docs.
 *
 * Lets the agent pull documentation/context from connected MCP servers on
 * demand: list what's available (per server or across all), then read a
 * resource into plain text that lands in context — resources → context
 * injection without auto-loading everything at startup (no context bloat).
 */

import { Type } from "typebox";
import type { ToolDefinition } from "../extensions/types.ts";

export interface McpResourceSummary {
	serverKey: string;
	uri: string;
	name: string;
	description: string;
}

export interface McpResourcesToolOptions {
	/** List resources across connected servers (optionally one server). */
	list: (serverKey?: string) => Promise<McpResourceSummary[]>;
	/** Read one resource into plain text for context injection. */
	read: (serverKey: string, uri: string) => Promise<{ ok: true; text: string } | { ok: false; error: string }>;
}

const parameters = Type.Object({
	action: Type.Union([Type.Literal("list"), Type.Literal("read")], {
		description: '"list" shows available resources; "read" loads one into context.',
	}),
	server: Type.Optional(Type.String({ description: "Restrict listing to one MCP server key." })),
	uri: Type.Optional(Type.String({ description: "Resource URI to read (from a prior list)." })),
});

export function createMcpResourcesToolDefinition(options: McpResourcesToolOptions): ToolDefinition {
	return {
		name: "mcp_resources",
		label: "mcp_resources",
		description:
			"Work with MCP resources (context documents exposed by connected MCP servers). Use action=list to see what's available, then action=read to load one into your context as plain text. Resources are loaded on demand — nothing is auto-injected.",
		parameters,
		async execute(_toolCallId: string, params: unknown) {
			const args = params as { action: "list" | "read"; server?: string; uri?: string };
			if (args.action === "list") {
				const resources = await options.list(args.server);
				if (resources.length === 0) {
					return {
						content: [{ type: "text", text: "No MCP resources available across connected servers." }],
						details: { ok: true, count: 0 },
					};
				}
				const lines = resources.map(
					(resource) =>
						`- [${resource.serverKey}] ${resource.name} — ${resource.uri}${resource.description ? ` (${resource.description})` : ""}`,
				);
				return {
					content: [{ type: "text", text: `MCP resources (${resources.length}):\n${lines.join("\n")}` }],
					details: { ok: true, count: resources.length },
				};
			}
			if (!args.server || !args.uri) {
				return {
					content: [{ type: "text", text: "action=read requires both server and uri (from a prior list)." }],
					details: { isError: true },
				};
			}
			const result = await options.read(args.server, args.uri);
			if (!result.ok) {
				return {
					content: [{ type: "text", text: `mcp_resources read failed: ${result.error}` }],
					details: { isError: true },
				};
			}
			return {
				content: [{ type: "text", text: result.text }],
				details: { ok: true, server: args.server, uri: args.uri },
			};
		},
	};
}

/** Fallback for contexts without an MCP manager. */
export function createUnavailableMcpResourcesToolDefinition(): ToolDefinition {
	return {
		name: "mcp_resources",
		label: "mcp_resources",
		description: "Work with MCP resources (context documents from MCP servers).",
		parameters,
		async execute() {
			return {
				content: [{ type: "text", text: "MCP resources are not available in this context." }],
				details: { isError: true },
			};
		},
	};
}
