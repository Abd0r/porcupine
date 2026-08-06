/**
 * MCP v2 — OAuth token cache + provider factory.
 *
 * Scope (per approved design): implement the credential plumbing + config
 * surface + a durable per-server token cache now; mark the interactive browser
 * flow as the remaining slice.
 *
 *   - `McpOAuthTokenCache` persists tokens per server to
 *     `~/.porcupine/agent/mcp-oauth.json` with **0600** perms so they survive
 *     restarts. (OS keyring = future enhancement — noted limitation.)
 *   - `createOAuthProvider(serverKey, oauth, cache)` returns an SDK
 *     `OAuthClientProvider`:
 *       * clientId + clientSecret  → `ClientCredentialsProvider` (caching)
 *       * clientId + privateKey    → `PrivateKeyJwtProvider` (caching)
 *       * otherwise (browser flow) → the remaining slice; signals `authRequired`
 *         so the manager surfaces `auth_required` health with a clear note.
 *
 * The caching providers override `tokens()` / `saveTokens()` so token exchanges
 * performed by the SDK are transparently persisted to (and seeded from) the
 * durable per-server cache.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { ClientCredentialsProvider, PrivateKeyJwtProvider } from "@modelcontextprotocol/sdk/client/auth-extensions.js";
import type { OAuthClientInformation, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { getAgentDir } from "../../config.ts";
import { deleteSecret, hasKeychain, readSecret, writeSecret } from "../keyring.ts";
import { BrowserOAuthProvider } from "./oauth-browser.ts";

// ============================================================================
// Durable token cache
// ============================================================================

export interface PersistedOauthEntry {
	/** Raw OAuthTokens for the server. */
	tokens?: OAuthTokens;
	/** Registered client information (for DCR servers). */
	clientInformation?: OAuthClientInformation;
	/** ISO timestamp of when tokens were (re)stored. */
	savedAt?: string;
}

export interface McpOAuthTokenCache {
	/** Load tokens for a server, or undefined. */
	get(serverKey: string): OAuthTokens | undefined;
	/** Persist tokens for a server. */
	set(serverKey: string, tokens: OAuthTokens): void;
	/** Whether the cache has any persisted token for a server. */
	has(serverKey: string): boolean;
	/** Remove persisted state for a server. */
	remove(serverKey: string): void;
	/** Load DCR-registered client information for a server (browser flow). */
	getClientInformation?(serverKey: string): OAuthClientInformation | undefined;
	/** Persist DCR-registered client information for a server (browser flow). */
	setClientInformation?(serverKey: string, info: OAuthClientInformation): void;
	/** Flush any pending writes to disk (best-effort; in-memory impls may no-op). */
	flush?(): void;
	/** Async warm-up for keychain-backed caches (hydrate before connecting). */
	load?(): Promise<void>;
}

const OAUTH_FILE = "mcp-oauth.json";

function readCacheFile(agentDir: string): Record<string, PersistedOauthEntry> {
	const filePath = path.join(agentDir, OAUTH_FILE);
	if (!fs.existsSync(filePath)) return {};
	try {
		const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed as Record<string, PersistedOauthEntry>;
		}
		return {};
	} catch {
		return {};
	}
}

function writeCacheFile(agentDir: string, data: Record<string, PersistedOauthEntry>): void {
	const filePath = path.join(agentDir, OAUTH_FILE);
	if (!fs.existsSync(agentDir)) {
		fs.mkdirSync(agentDir, { recursive: true });
	}
	// Write atomically, then chmod 0600 (owner-only).
	const tmp = `${filePath}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
	fs.chmodSync(tmp, 0o600);
	fs.renameSync(tmp, filePath);
	fs.chmodSync(filePath, 0o600);
}

/**
 * File-backed token cache. Tokens live at ~/.porcupine/agent/mcp-oauth.json
 * with 0600 permissions. Limit: plaintext-at-rest — OS keyring is a future
 * enhancement (see research/mcp-support.md §5.2 #6).
 */
export class McpOAuthFileCache implements McpOAuthTokenCache {
	private readonly agentDir: string;
	private data: Record<string, PersistedOauthEntry>;
	private dirty = false;

	constructor(agentDir?: string) {
		this.agentDir = agentDir ?? getAgentDir();
		this.data = readCacheFile(this.agentDir);
	}

	get(serverKey: string): OAuthTokens | undefined {
		return this.data[serverKey]?.tokens;
	}

	getClientInformation(serverKey: string): OAuthClientInformation | undefined {
		return this.data[serverKey]?.clientInformation;
	}

	setClientInformation(serverKey: string, info: OAuthClientInformation): void {
		const entry = this.data[serverKey] ?? {};
		entry.clientInformation = info;
		this.data[serverKey] = entry;
		this.dirty = true;
	}

	set(serverKey: string, tokens: OAuthTokens): void {
		const entry = this.data[serverKey] ?? {};
		entry.tokens = tokens;
		entry.savedAt = new Date().toISOString();
		this.data[serverKey] = entry;
		this.dirty = true;
	}

	remove(serverKey: string): void {
		if (this.data[serverKey]) {
			delete this.data[serverKey];
			this.dirty = true;
		}
	}

	has(serverKey: string): boolean {
		return this.data[serverKey]?.tokens !== undefined;
	}

	/** Flush any pending writes to disk (idempotent, best-effort). */
	flush(): void {
		if (!this.dirty) return;
		this.dirty = false;
		try {
			writeCacheFile(this.agentDir, this.data);
		} catch {
			// Best-effort: token persistence failing is non-fatal.
		}
	}

	/** Server keys known to the file (used by the keyring cache to hydrate). */
	getKnownServerKeys(): string[] {
		return Object.keys(this.data);
	}

	/** Write an index-only entry (no tokens) so the keyring cache knows the key. */
	setIndex(serverKey: string, entry: Pick<PersistedOauthEntry, "savedAt" | "clientInformation">): void {
		const current = this.data[serverKey] ?? {};
		this.data[serverKey] = { ...current, savedAt: entry.savedAt, clientInformation: entry.clientInformation };
		this.dirty = true;
	}
}

/**
 * OS-keyring-backed token cache (tokens at rest in the platform keychain via
 * src/core/keyring.ts), with the 0600 file as index + fallback.
 *
 * The OAuthClientProvider interface is synchronous, so reads come from an
 * in-memory map hydrated by `load()` (async, called before connecting); writes
 * update memory synchronously and persist to the keychain in the background.
 * When no keychain backend exists, the 0600 file holds everything.
 */
export class McpOAuthKeyringCache implements McpOAuthTokenCache {
	private readonly agentDir: string;
	/** 0600 file: index (serverKey → savedAt) + full fallback when no keychain. */
	private readonly fallback: McpOAuthFileCache;
	private readonly memory = new Map<string, PersistedOauthEntry>();
	private keychainReady = false;
	private loaded = false;

	constructor(agentDir?: string) {
		this.agentDir = agentDir ?? getAgentDir();
		this.fallback = new McpOAuthFileCache(this.agentDir);
	}

	/**
	 * Async warm-up: probe the keychain and hydrate memory from it. Call once
	 * before the manager connects so persisted tokens are visible to the (sync)
	 * provider interface.
	 */
	async load(): Promise<void> {
		if (this.loaded) return;
		this.loaded = true;
		this.keychainReady = await hasKeychain(this.agentDir, "porcupine-mcp", "probe");
		if (!this.keychainReady) return;
		// Hydrate every server key known to the index file from the keychain.
		const knownKeys = this.fallback.getKnownServerKeys();
		for (const serverKey of knownKeys) {
			const raw = await readSecret(this.agentDir, "porcupine-mcp", serverKey);
			if (!raw) continue;
			try {
				this.memory.set(serverKey, JSON.parse(raw) as PersistedOauthEntry);
			} catch {
				// Corrupt keychain entry — skip; the user can re-auth.
			}
		}
	}

	/** True when a real keychain backend is backing this cache. */
	get usingKeychain(): boolean {
		return this.keychainReady;
	}

	get(serverKey: string): OAuthTokens | undefined {
		return this.memory.get(serverKey)?.tokens ?? this.fallback.get(serverKey);
	}

	getClientInformation(serverKey: string): OAuthClientInformation | undefined {
		return this.memory.get(serverKey)?.clientInformation ?? this.fallback.getClientInformation(serverKey);
	}

	set(serverKey: string, tokens: OAuthTokens): void {
		const existing = this.memory.get(serverKey) ?? {};
		existing.tokens = tokens;
		existing.savedAt = new Date().toISOString();
		this.memory.set(serverKey, existing);
		// Index the key in the file first (so load() knows to hydrate it), then
		// persist the full entry to the keychain in the background — OR, if the
		// keychain write fails (backend transiently unavailable), persist the
		// full token to the 0600 fallback file so nothing is lost on restart.
		this.fallback.setIndex(serverKey, existing);
		this.fallback.flush();
		if (this.keychainReady) {
			void writeSecret(this.agentDir, "porcupine-mcp", serverKey, JSON.stringify(existing)).catch(() => {
				// Keychain write failed → fall back to the durable 0600 file so the
				// token survives restarts even though the keychain backend is down.
				this.fallback.set(serverKey, tokens);
				this.fallback.flush();
			});
		} else {
			this.fallback.set(serverKey, tokens);
			this.fallback.flush();
		}
	}

	setClientInformation(serverKey: string, info: OAuthClientInformation): void {
		const existing = this.memory.get(serverKey) ?? {};
		existing.clientInformation = info;
		this.memory.set(serverKey, existing);
		this.fallback.setIndex(serverKey, existing);
		this.fallback.flush();
		if (this.keychainReady) {
			void writeSecret(this.agentDir, "porcupine-mcp", serverKey, JSON.stringify(existing)).catch(() => {
				// Non-fatal.
			});
		}
	}

	has(serverKey: string): boolean {
		return this.get(serverKey) !== undefined;
	}

	remove(serverKey: string): void {
		this.memory.delete(serverKey);
		if (this.keychainReady) void deleteSecret(this.agentDir, "porcupine-mcp", serverKey);
		this.fallback.remove(serverKey);
		this.fallback.flush();
	}

	flush(): void {
		this.fallback.flush();
	}
}

// ============================================================================
// Caching credential providers
// ============================================================================

/** Client credentials provider whose tokens flow through a durable cache. */
export class CachingClientCredentialsProvider extends ClientCredentialsProvider {
	private readonly cache: McpOAuthTokenCache;
	private readonly serverKey: string;

	constructor(
		options: { clientId: string; clientSecret: string; scope?: string },
		cache: McpOAuthTokenCache,
		serverKey: string,
	) {
		super(options);
		this.cache = cache;
		this.serverKey = serverKey;
	}

	override tokens(): OAuthTokens | undefined {
		return this.cache.get(this.serverKey) ?? super.tokens();
	}

	override saveTokens(tokens: OAuthTokens): void {
		this.cache.set(this.serverKey, tokens);
		this.cache.flush?.();
		super.saveTokens(tokens);
	}
}

/** Private-key JWT provider whose tokens flow through a durable cache. */
export class CachingPrivateKeyJwtProvider extends PrivateKeyJwtProvider {
	private readonly cache: McpOAuthTokenCache;
	private readonly serverKey: string;

	constructor(
		options: {
			clientId: string;
			privateKey: string | Uint8Array | Record<string, unknown>;
			algorithm: string;
			scope?: string;
		},
		cache: McpOAuthTokenCache,
		serverKey: string,
	) {
		super(options);
		this.cache = cache;
		this.serverKey = serverKey;
	}

	override tokens(): OAuthTokens | undefined {
		return this.cache.get(this.serverKey) ?? super.tokens();
	}

	override saveTokens(tokens: OAuthTokens): void {
		this.cache.set(this.serverKey, tokens);
		this.cache.flush?.();
		super.saveTokens(tokens);
	}
}

// ============================================================================
// Provider factory
// ============================================================================

export type OAuthFlowKind = "client_credentials" | "private_key_jwt" | "browser";

export interface OAuthProviderDecision {
	/** SDK client provider (credential flows). undefined for the browser flow. */
	provider: OAuthClientProvider | undefined;
	/** Classified flow kind. */
	kind: OAuthFlowKind;
	/** True when this server needs interactive authorization before first connect. */
	authRequired: boolean;
}

export interface ResolvedOAuthInput {
	clientId?: string;
	clientSecret?: string;
	scope?: string;
	privateKey?: string;
	algorithm?: string;
}

/**
 * Build an OAuthClientProvider (or classify the server as needing the browser
 * flow). Non-interactive credential flows are fully wired; the browser flow is
 * the remaining slice and signals `authRequired` so the manager reports
 * `auth_required` health with a clear note.
 */
export function createOAuthProvider(
	serverKey: string,
	oauth: ResolvedOAuthInput | undefined,
	cache: McpOAuthTokenCache,
): OAuthProviderDecision {
	if (!oauth) {
		return { provider: undefined, kind: "browser", authRequired: false };
	}

	if (oauth.clientId && oauth.clientSecret) {
		const provider = new CachingClientCredentialsProvider(
			{ clientId: oauth.clientId, clientSecret: oauth.clientSecret, scope: oauth.scope },
			cache,
			serverKey,
		);
		return { provider, kind: "client_credentials", authRequired: false };
	}

	if (oauth.clientId && oauth.privateKey) {
		const provider = new CachingPrivateKeyJwtProvider(
			{
				clientId: oauth.clientId,
				privateKey: oauth.privateKey,
				algorithm: oauth.algorithm ?? "RS256",
				scope: oauth.scope,
			},
			cache,
			serverKey,
		);
		return { provider, kind: "private_key_jwt", authRequired: false };
	}

	// Any other OAuth config (no machine credentials) → interactive browser flow
	// (DCR + PKCE) with a local callback. authRequired only when the config asks
	// for it (clientId/scope) — an empty object just provides the provider.
	if (oauth) {
		return {
			provider: new BrowserOAuthProvider(serverKey, cache),
			kind: "browser",
			authRequired: Boolean(oauth.clientId || oauth.scope),
		};
	}

	return { provider: undefined, kind: "browser", authRequired: false };
}
