/**
 * MCP v2 — Streamable HTTP config parsing + required-field validation (pure).
 *
 * This module centralizes the http-specific parsing rules so they can be unit
 * tested without spinning up a transport:
 *   - accepted `type` aliases: "http" | "streamableHttp"
 *   - a `url` is REQUIRED and must be an http(s) absolute URL.
 *   - `headers` must contain only string values (after ${VAR} expansion handled by config.ts).
 *   - OAuth: `false`/absent = none; an object opts into OAuth and validates fields.
 *
 * Policy: a legacy `sse` (or any other) transport type is NOT implemented — it
 * maps to requireUnsupportedTransport (clear "unsupported legacy transport"
 * error). SSE is deprecated in the 2026-07-28 spec and deliberately not shipped.
 */

export interface McpHttpParseResult {
	type: "stdio" | "http";
	url: string;
	headers: Record<string, string>;
	oauth: McpHttpOAuth | undefined;
	/** Transport type as written in config ("http" | "streamableHttp"). */
	transportAlias?: "http" | "streamableHttp";
}

export interface McpHttpOAuth {
	clientId?: string;
	clientSecret?: string;
	scope?: string;
	privateKey?: string;
	algorithm?: string;
}

export interface McpHttpValidation {
	ok: boolean;
	transport: "http" | "stdio" | "unsupported";
	transportAlias?: "http" | "streamableHttp";
	result?: McpHttpParseResult;
	/** Clear error message when not ok. */
	error?: string;
}

const SUPPORTED = new Set(["http", "streamableHttp"]);

/**
 * Parse + validate a raw MCP server config object for the HTTP transport path.
 *
 * Returns `ok: true` with a parse result, or `ok: false` with a clear error.
 * `transport: "unsupported"` covers non-http types we do not ship (e.g. sse).
 */
export function validateHttpServerConfig(raw: Record<string, unknown> | undefined): McpHttpValidation {
	if (!raw || typeof raw !== "object") {
		return {
			ok: false,
			transport: "unsupported",
			error: "Invalid MCP server config object.",
		};
	}

	const type = raw.type;
	if (typeof type !== "string") {
		return {
			ok: false,
			transport: "unsupported",
			error: "MCP server is missing the required `type` field.",
		};
	}
	if (!SUPPORTED.has(type)) {
		return {
			ok: false,
			transport: "unsupported",
			error:
				type === "sse"
					? `Unsupported legacy transport "sse": SSE is deprecated in MCP and is NOT shipped by Porcupine. Use "http" (Streamable HTTP) or "stdio".`
					: `Unsupported MCP transport type "${String(type)}". Supported: "stdio", "http" (alias "streamableHttp").`,
		};
	}

	const url = typeof raw.url === "string" ? (raw.url as string).trim() : "";
	if (!url) {
		return {
			ok: false,
			transport: "http",
			error: `Streamable HTTP server is missing the required \`url\` field.`,
		};
	}
	if (!/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(url) || !/^https?:\/\//i.test(url)) {
		return {
			ok: false,
			transport: "http",
			error: `Streamable HTTP server \`url\` must be an absolute http(s) URL; got "${url}".`,
		};
	}

	// Headers must be a record of strings.
	const headers: Record<string, string> = {};
	const rawHeaders = raw.headers;
	if (rawHeaders !== undefined) {
		if (!rawHeaders || typeof rawHeaders !== "object" || Array.isArray(rawHeaders)) {
			return {
				ok: false,
				transport: "http",
				error: "Streamable HTTP `headers` must be an object of string values.",
			};
		}
		for (const [k, v] of Object.entries(rawHeaders as Record<string, unknown>)) {
			if (typeof v !== "string") {
				return {
					ok: false,
					transport: "http",
					error: `Streamable HTTP header "${k}" must be a string.`,
				};
			}
			headers[k] = v;
		}
	}

	// OAuth.
	let oauth: McpHttpOAuth | undefined;
	const rawOauth = raw.oauth;
	if (rawOauth !== undefined && rawOauth !== false && rawOauth !== null) {
		if (typeof rawOauth === "boolean") {
			// true → OAuth requested with no pre-registered credentials (browser flow).
			oauth = {};
		} else if (typeof rawOauth === "object" && !Array.isArray(rawOauth)) {
			const o = rawOauth as Record<string, unknown>;
			oauth = {
				clientId: typeof o.clientId === "string" ? o.clientId : undefined,
				clientSecret: typeof o.clientSecret === "string" ? o.clientSecret : undefined,
				scope: typeof o.scope === "string" ? o.scope : undefined,
				privateKey: typeof o.privateKey === "string" ? o.privateKey : undefined,
				algorithm: typeof o.algorithm === "string" ? o.algorithm : undefined,
			};
		} else {
			return {
				ok: false,
				transport: "http",
				error: "Streamable HTTP `oauth` must be `false` or an object.",
			};
		}
	}

	return {
		ok: true,
		transport: "http",
		transportAlias: type as "http" | "streamableHttp",
		result: {
			type: "http",
			url,
			headers,
			oauth,
		},
	};
}
