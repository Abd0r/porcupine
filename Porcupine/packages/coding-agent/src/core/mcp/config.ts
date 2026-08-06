/**
 * MCP (Model Context Protocol) v1 client — config loading/merging.
 *
 * Loads and merges two layered sources:
 *   - Global:   ~/.porcupine/agent/mcp.json         (user-wide servers)
 *   - Project:  <cwd>/.porcupine/mcp.json            (project servers)
 *
 * Project config merges over/alongside global:
 *   - A server key present only in project is added.
 *   - A server key present in both: project fully overrides the global entry
 *     (enabling project config to disable a global server via `enabled: false`).
 *
 * Environment expansion: values are expanded via a small local expander that
 * supports `${VAR}` and `${VAR:-default}`. Command-style `!cmd` resolution is
 * intentionally NOT applied to MCP server config (server commands themselves
 * may be arbitrary; we do not pre-execute config payloads).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { Value } from "typebox/value";
import { CONFIG_DIR_NAME, getAgentDir } from "../../config.ts";
import { resolvePath } from "../../utils/paths.ts";
import { type McpConfigFile, McpConfigFileSchema, type McpServerConfig, type ResolvedMcpServer } from "./types.ts";

// ============================================================================
// Env expansion
// ============================================================================

/**
 * Expand `${VAR}` and `${VAR:-default}` references in a string.
 * Unmatched required vars (no default) are left as-is (caller decides).
 */
export function expandEnv(value: string, env: Record<string, string> = process.env as Record<string, string>): string {
	return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g, (match, name: string, def?: string) => {
		const hasDefault = def !== undefined;
		const resolved = env[name];
		if (resolved !== undefined) return resolved;
		if (hasDefault) return def;
		return match; // leave unresolved — caller can reject or keep literal
	});
}

/**
 * Expand env references in a full env map.
 * Missing required vars (no default) are dropped.
 */
export function expandEnvMap(
	values: Record<string, string> | undefined,
	env: Record<string, string> = process.env as Record<string, string>,
): Record<string, string> {
	if (!values) return {};
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(values)) {
		const expanded = expandEnv(v, env);
		// Drop values that still reference an unset required var.
		if (/\$\{[A-Za-z_]/.test(expanded) && !expanded.includes(":-")) {
			continue;
		}
		out[k] = expanded;
	}
	return out;
}

// ============================================================================
// Config file loading
// ============================================================================

function toResolved(
	key: string,
	scope: "global" | "project",
	baseDir: string,
	config: McpServerConfig,
): ResolvedMcpServer | undefined {
	if (config.type == null) {
		return undefined;
	}
	if (config.type === "http" || config.type === "streamableHttp") {
		return toResolvedHttp(key, scope, config);
	}
	return toResolvedStdio(key, scope, baseDir, config);
}

/** Resolve a Streamable HTTP server. URL is required; command/args are ignored. */
function toResolvedHttp(
	key: string,
	scope: "global" | "project",
	config: McpServerConfig,
): ResolvedMcpServer | undefined {
	const url = (config.url ?? "").trim();
	if (!url || !/^https?:\/\//i.test(url)) {
		// Missing/unsupported legacy address — mirror the v1 fail-on-invalid policy.
		return undefined;
	}
	const headers = expandEnvMap(config.headers);
	let oauth:
		| { clientId?: string; clientSecret?: string; scope?: string; privateKey?: string; algorithm?: string }
		| undefined;
	if (config.oauth && typeof config.oauth === "object") {
		oauth = {
			clientId: config.oauth.clientId,
			clientSecret: config.oauth.clientSecret,
			scope: config.oauth.scope,
			privateKey: config.oauth.privateKey,
			algorithm: config.oauth.algorithm,
		};
	}
	const resolved: Omit<ResolvedMcpServer, "contentHash"> = {
		serverKey: key,
		scope,
		baseDir: "/",
		type: "http",
		command: "",
		args: [],
		env: {},
		cwd: "/",
		url,
		headers,
		oauth,
		enabled: config.enabled ?? true,
		allow: new Set(config.allow ?? []),
		timeoutMs: config.timeoutMs ?? 60_000,
	};
	return { ...resolved, contentHash: hashServerContent(resolved) };
}

function toResolvedStdio(
	key: string,
	scope: "global" | "project",
	baseDir: string,
	config: McpServerConfig,
): ResolvedMcpServer | undefined {
	const resolved: Omit<ResolvedMcpServer, "contentHash"> = {
		serverKey: key,
		scope,
		baseDir,
		type: "stdio",
		command: config.command ?? "",
		args: config.args ?? [],
		env: expandEnvMap(config.env),
		cwd: config.cwd ? resolvePath(config.cwd, baseDir) : baseDir,
		url: "",
		headers: {},
		enabled: config.enabled ?? true,
		allow: new Set(config.allow ?? []),
		timeoutMs: config.timeoutMs ?? 60_000,
	};
	return { ...resolved, contentHash: hashServerContent(resolved) };
}

/** Read and parse a single mcp.json file, validating against the TypeBox schema. */
export function readMcpConfigFile(filePath: string): McpConfigFile | undefined {
	const absolute = resolvePath(filePath);
	if (!fs.existsSync(absolute)) return undefined;
	try {
		const raw = fs.readFileSync(absolute, "utf-8");
		const parsed = JSON.parse(raw) as unknown;
		if (!McpConfigFileSchema || !Value.Check(McpConfigFileSchema, parsed)) {
			return undefined;
		}
		return parsed as McpConfigFile;
	} catch {
		return undefined;
	}
}

// ============================================================================
// Content hash (rug-pull / CVE-2025-54136 mitigation)
// ============================================================================

function hashServerContent(server: {
	command: string;
	args: string[];
	env: Record<string, string>;
	cwd: string;
	type: "stdio" | "http";
	url: string;
	headers: Record<string, string>;
	oauth?: { clientId?: string; clientSecret?: string; scope?: string; privateKey?: string; algorithm?: string };
}): string {
	if (server.type === "http") {
		return hashString(
			`http\nurl=${server.url}\nheaders=${JSON.stringify(Object.entries(server.headers).sort())}\noauth=${JSON.stringify(server.oauth ?? null)}\nallow=${JSON.stringify([])}`,
		);
	}
	return hashString(
		`command=${server.command}\nargs=${JSON.stringify(server.args)}\nenv=${JSON.stringify(Object.entries(server.env).sort())}\ncwd=${server.cwd}`,
	);
}

/** Minimal FNV-1a 32-bit hex hash. Stable across restarts. */
export function hashString(input: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

// ============================================================================
// Merge + load
// ============================================================================

export interface LoadMcpConfigOptions {
	cwd: string;
	agentDir?: string;
	/** Provide an explicit env for expansion (defaults to process.env). */
	env?: Record<string, string>;
}

export interface LoadedMcpConfig {
	/** All resolved servers across both scopes, merged. */
	servers: ResolvedMcpServer[];
	/** Absolute paths to the config files that were consulted. */
	globalPath: string;
	projectPath: string;
	/** Errors encountered while reading/validating (non-fatal). */
	errors: string[];
}

/**
 * Load + merge global and project MCP config.
 *
 * Project servers merge over global; a project entry fully overrides a
 * same-key global server, and may disable it via `enabled: false`.
 */
export function loadMcpConfig(options: LoadMcpConfigOptions): LoadedMcpConfig {
	const cwd = resolvePath(options.cwd);
	const agentDir = resolvePath(options.agentDir ?? getAgentDir());
	const errors: string[] = [];

	const byKey = new Map<string, { global?: ResolvedMcpServer; project?: ResolvedMcpServer }>();

	const globalPath = path.join(agentDir, "mcp.json");
	const projectPath = path.join(cwd, CONFIG_DIR_NAME, "mcp.json");

	const globalFile = readMcpConfigFile(globalPath);
	const projectFile = readMcpConfigFile(projectPath);
	if (fs.existsSync(globalPath) && !globalFile) {
		errors.push(`Invalid global MCP config: ${globalPath}`);
	}
	if (fs.existsSync(projectPath) && !projectFile) {
		errors.push(`Invalid project MCP config: ${projectPath}`);
	}

	if (globalFile?.mcpServers) {
		for (const [key, raw] of Object.entries(globalFile.mcpServers)) {
			if (!raw || typeof raw !== "object") continue;
			const resolved = toResolved(key, "global", agentDir, raw);
			if (!resolved) {
				errors.push(`Global MCP server "${key}" has an invalid or unsupported config.`);
				continue;
			}
			byKey.set(key, { global: resolved });
		}
	}
	if (projectFile?.mcpServers) {
		for (const [key, raw] of Object.entries(projectFile.mcpServers)) {
			if (!raw || typeof raw !== "object") continue;
			const resolved = toResolved(key, "project", cwd, raw);
			if (!resolved) {
				errors.push(`Project MCP server "${key}" has an invalid or unsupported config.`);
				continue;
			}
			const existing = byKey.get(key) ?? {};
			existing.project = resolved;
			byKey.set(key, existing);
		}
	}

	const servers: ResolvedMcpServer[] = [];
	for (const [key, pair] of byKey.entries()) {
		// Project fully overrides the same-key global server.
		if (pair.project) {
			servers.push(pair.project);
		} else if (pair.global) {
			servers.push(pair.global);
		} else {
			errors.push(`MCP server "${key}" has no resolvable config.`);
		}
	}

	return { servers, globalPath, projectPath, errors };
}
