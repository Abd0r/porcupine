/**
 * MCP (Model Context Protocol) v1 client — type definitions.
 *
 * Defines the layered config schema (global + project), resolved server
 * configs, per-server health states, and the McpToolGuard result types.
 *
 * v1: stdio only. v2 adds `http` (Streamable HTTP), OAuth, and resources/prompts.
 */

import { type Static, Type } from "typebox";

// ============================================================================
// Config schema (TypeBox) — the raw mcp.json file contract
// ============================================================================
//
// mcp.json shape:
//   {
//     "mcpServers": {
//       "<serverKey>": {
//         "type": "stdio",               // REQUIRED (stdio | later http)
//         "command": "npx",              // REQUIRED for stdio
//         "args": ["-y", "some-mcp-server"],
//         "env": { "API_KEY": "${API_KEY}" },
//         "cwd": ".",
//         "enabled": true,
//         "allow": ["read_file"],        // per-server allowlist (default deny)
//         "timeoutMs": 60000
//       }
//     }
//   }

/** Additional environment strings bypass the allowlist gate. */
export const MCP_TOOL_MAX_DESCRIPTION = 1200;

export const McpOAuthSchema = Type.Object({
	/** client_id for the OAuth client (client_credentials or private_key_jwt). */
	clientId: Type.Optional(Type.String()),
	/** client_secret for client_secret_basic (client_credentials grant). */
	clientSecret: Type.Optional(Type.String()),
	/** Space-separated scopes. */
	scope: Type.Optional(Type.String()),
	/** PEM/Uint8Array/JWK private key for private_key_jwt (RFC 7523 Section 2.2). */
	privateKey: Type.Optional(Type.String()),
	/** JWT signing algorithm for private_key_jwt (default RS256). */
	algorithm: Type.Optional(Type.String()),
});

export const McpServerSchema = Type.Object({
	/** Transport type. stdio (local) or http/streamableHttp (Streamable HTTP). */
	type: Type.Union([Type.Literal("stdio"), Type.Literal("http"), Type.Literal("streamableHttp")]),
	/** Executable to spawn for stdio servers. Required for stdio. */
	command: Type.Optional(Type.String()),
	/** Command-line arguments for stdio servers. */
	args: Type.Optional(Type.Array(Type.String())),
	/** Environment overrides/injections for the child process. Values support ${VAR} expansion. */
	env: Type.Optional(Type.Record(Type.String(), Type.String())),
	/** Working directory for the child process. Resolved relative to the folder that declared the server. */
	cwd: Type.Optional(Type.String()),
	/** Base URL for Streamable HTTP servers. Required for http. */
	url: Type.Optional(Type.String()),
	/** Extra HTTP headers for Streamable HTTP servers (e.g. Authorization). Values support ${VAR} expansion. */
	headers: Type.Optional(Type.Record(Type.String(), Type.String())),
	/** OAuth config for Streamable HTTP servers (v2). */
	oauth: Type.Optional(Type.Union([Type.Boolean(), McpOAuthSchema])),
	/** Whether the server is enabled. Default true. */
	enabled: Type.Optional(Type.Boolean()),
	/** Per-server allowlist of tool names that bypass the confirm gate. Empty/missing = deny-by-default (fail-closed). */
	allow: Type.Optional(Type.Array(Type.String())),
	/** Per-call timeout in milliseconds for tool calls. Default 60000. */
	timeoutMs: Type.Optional(Type.Number()),
});

/** Map of server-key → server config. */
export const McpConfigFileSchema = Type.Object({
	mcpServers: Type.Optional(Type.Record(Type.String(), McpServerSchema)),
});

export type McpServerConfig = Static<typeof McpServerSchema>;
export type McpConfigFile = Static<typeof McpConfigFileSchema>;

/**
 * Resolved server config after env expansion and defaulting.
 * This is the runtime shape the manager/backend consumes.
 */
export type McpTransportType = "stdio" | "http";

/** Resolved OAuth config for a Streamable HTTP server. */
export interface ResolvedOAuthConfig {
	clientId?: string;
	clientSecret?: string;
	scope?: string;
	privateKey?: string;
	algorithm?: string;
}

export interface ResolvedMcpServer {
	/** Server key (unique tool-namespace prefix). */
	serverKey: string;
	/** Source folder: "global" or "project". */
	scope: "global" | "project";
	/** The directory this server's relative paths resolve against. */
	baseDir: string;
	type: McpTransportType;
	/** stdio-only: executable. */
	command: string;
	/** stdio-only: arguments. */
	args: string[];
	/** stdio-only: child env overrides. */
	env: Record<string, string>;
	/** stdio-only: working directory. */
	cwd: string;
	/** http-only: base URL. */
	url: string;
	/** http-only: extra request headers. */
	headers: Record<string, string>;
	/** http-only: OAuth config (undefined when none requested). */
	oauth?: ResolvedOAuthConfig;
	enabled: boolean;
	/** Per-server allowlist of raw MCP tool names. Fail-closed (deny unless allowlisted/user-approved). */
	allow: Set<string>;
	timeoutMs: number;
	/** Content hash of the resolved command+args+env+cwd (rug-pull detection). */
	contentHash: string;
}

// ============================================================================
// Health states
// ============================================================================

/** Per-server lifecycle/health state surfaced by /mcp status. */
export type McpServerHealth = "connected" | "auth_required" | "failed" | "disabled";

export interface McpServerStatus {
	serverKey: string;
	scope: "global" | "project";
	health: McpServerHealth;
	/** Number of MCP tools registered into the agent registry for this server. */
	toolCount: number;
	/** Number of resources exposed by this server / surfaced into context. */
	resourceCount: number;
	/** Number of prompts exposed by this server / surfaced as slash commands. */
	promptCount: number;
	/** When the server is in "failed" state, the reason. */
	error?: string;
	/** When "auth_required", a human note about the auth state. */
	authNote?: string;
	/** OAuth state for HTTP servers: authorized | credentialed | auth_required | none. */
	oauthState?: string;
	/** Content hash the server was approved under (tight-couples approval to content). */
	approvedHash?: string;
	/** Server transport type. */
	transport: McpTransportType;
	enabled: boolean;
}

// ============================================================================
// McpToolGuard result types
// ============================================================================

/** How a guard decision was reached. Mirrors the bash guard's `via` idiom. */
export type McpGuardVia = "allowlist" | "manual" | "auto" | "hardline" | "error" | "content-hash" | "approved";

export interface McpGuardContext {
	/** Full interaction mode: ask | normal | auto. */
	mode: "ask" | "normal" | "auto";
	/** Resolved server config (for allowlist + content hash). */
	server: ResolvedMcpServer;
	/** Raw MCP tool name (un-prefixed). */
	mcpToolName: string;
	/** The prefixed agent tool name `${serverKey}_${mcpToolName}`. */
	agentToolName: string;
	/** Tool call arguments (used for Ask-mode confirmation and auto classify). */
	arguments: Record<string, unknown>;
}

export interface McpGuardDecision {
	approved: boolean;
	via: McpGuardVia;
	message?: string;
}
