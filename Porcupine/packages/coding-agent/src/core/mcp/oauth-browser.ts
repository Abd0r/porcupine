/**
 * MCP v2 — interactive browser OAuth (DCR + PKCE) provider.
 *
 * Implements the SDK `OAuthClientProvider` for the authorization-code + PKCE
 * flow against MCP servers that expose an OAuth authorization server:
 *
 *   1. The SDK transport performs Dynamic Client Registration (RFC 7591) using
 *      our public-client `clientMetadata` (redirect to a fixed local port).
 *   2. The SDK builds the PKCE authorization URL and calls
 *      `redirectToAuthorization(url)`.
 *   3. We open the system browser AND run a local callback server on
 *      127.0.0.1 to capture the `?code=...&state=...` redirect.
 *   4. `prepareTokenRequest()` supplies code + code_verifier so the SDK
 *      exchanges for tokens, which are persisted via the token cache
 *      (OS keyring first, 0600-file fallback).
 *
 * Local-only callback server (127.0.0.1), fixed well-known port, state
 * verification, and a short timeout — no LAN exposure.
 */

import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
	OAuthClientInformation,
	OAuthClientInformationMixed,
	OAuthClientMetadata,
	OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { McpOAuthTokenCache } from "./oauth.ts";

/** Fixed well-known local callback port (Claude Code-style pattern). */
export const OAUTH_CALLBACK_PORT = 37238;
export const OAUTH_CALLBACK_PATH = "/callback";
export const OAUTH_CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

const redirectUrl = `http://127.0.0.1:${OAUTH_CALLBACK_PORT}${OAUTH_CALLBACK_PATH}`;

/** Open the user's default browser to a URL (platform-appropriate). */
async function openBrowser(url: string): Promise<void> {
	const platform = process.platform;
	const cmd = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
	const args = platform === "win32" ? ["/c", "start", "", url] : [url];
	await execFile(cmd, args, { timeout: 10_000 });
}

/**
 * Run a local HTTP callback server that captures the authorization `code` and
 * verifies the `state`. Resolves with the code; rejects on timeout/mismatch.
 *
 * Returns the capture `promise` together with an `abort` fn so callers can
 * guarantee the bound server is closed on EVERY path (EADDRINUSE, browser-open
 * failure, timeout, mismatch, success) — no leaked port 37238.
 */
export function captureAuthorizationCode(port: number): {
	promise: Promise<{ code: string; state: string }>;
	abort: () => void;
} {
	let server: Server | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;

	/** Release the bound listener + pending timer (idempotent). */
	const closeServer = (): void => {
		if (timer) {
			clearTimeout(timer);
			timer = undefined;
		}
		if (server) {
			server.close();
			server = undefined;
		}
	};

	const promise = new Promise<{ code: string; state: string }>((resolve, reject) => {
		server = createServer((req, res) => {
			const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
			if (url.pathname !== OAUTH_CALLBACK_PATH) {
				res.writeHead(404).end("not found");
				return;
			}
			const code = url.searchParams.get("code");
			const state = url.searchParams.get("state");
			res.writeHead(200, { "content-type": "text/html" });
			res.end(
				"<html><body style='font-family:system-ui;padding:2rem'><h2>Porcupine</h2><p>Authorization received — you can close this tab and return to the terminal.</p></body></html>",
			);
			closeServer();
			if (!code) {
				reject(new Error("OAuth callback missing authorization code"));
				return;
			}
			resolve({ code, state: state ?? "" });
		});
		server.on("error", (error) => {
			// Surfaces a clear, actionable error when the well-known callback port
			// is already taken (another Porcupine instance / in-flight auth).
			const normalized =
				error instanceof Error && (error as NodeJS.ErrnoException).code === "EADDRINUSE"
					? new Error(`OAuth callback port ${port} is in use — close the other Porcupine instance or process.`)
					: error instanceof Error
						? error
						: new Error(String(error));
			closeServer();
			reject(normalized);
		});
		timer = setTimeout(() => {
			closeServer();
			reject(new Error(`OAuth authorization timed out after ${OAUTH_CALLBACK_TIMEOUT_MS / 1000}s`));
		}, OAUTH_CALLBACK_TIMEOUT_MS);
		server.listen(port, "127.0.0.1");
	});

	const abort = (): void => {
		closeServer();
	};

	return { promise, abort };
}

/**
 * Interactive browser OAuth provider (public client, PKCE, local callback).
 * Requires a cache that persists tokens + registered client information.
 */
export class BrowserOAuthProvider implements OAuthClientProvider {
	private readonly serverKey: string;
	private readonly cache: McpOAuthTokenCache;
	private codeVerifierValue = "";
	private authorizationCode = "";
	private expectedState = "";

	constructor(serverKey: string, cache: McpOAuthTokenCache) {
		this.serverKey = serverKey;
		this.cache = cache;
	}

	get redirectUrl(): string {
		return redirectUrl;
	}

	get clientMetadata(): OAuthClientMetadata {
		return {
			client_name: "porcupine-coding-agent",
			redirect_uris: [redirectUrl],
			token_endpoint_auth_method: "none",
			grant_types: ["authorization_code"],
			response_types: ["code"],
		};
	}

	async state(): Promise<string> {
		this.expectedState = randomBytes(16).toString("hex");
		return this.expectedState;
	}

	clientInformation(): OAuthClientInformationMixed | undefined {
		return this.cache.getClientInformation?.(this.serverKey);
	}

	saveClientInformation(clientInformation: OAuthClientInformationMixed): void {
		this.cache.setClientInformation?.(this.serverKey, clientInformation as OAuthClientInformation);
	}

	tokens(): OAuthTokens | undefined {
		return this.cache.get(this.serverKey);
	}

	saveTokens(tokens: OAuthTokens): void {
		this.cache.set(this.serverKey, tokens);
	}

	async saveCodeVerifier(codeVerifier: string): Promise<void> {
		this.codeVerifierValue = codeVerifier;
	}

	async codeVerifier(): Promise<string> {
		return this.codeVerifierValue;
	}

	async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
		const expected = this.expectedState;
		// Start the callback server BEFORE opening the browser so no redirect is lost.
		const capture = captureAuthorizationCode(OAUTH_CALLBACK_PORT);
		// Attach a handler up front so a concurrent EADDRINUSE/timeout while the
		// browser is opening can never surface as an unhandled rejection; we
		// re-await the outcome below to surface the real result.
		const settled = capture.promise.then(
			(r) => ({ ok: true as const, value: r }),
			(error: unknown) => ({ ok: false as const, error }),
		);
		try {
			await openBrowser(authorizationUrl.toString());
			const outcome = await settled;
			if (!outcome.ok) {
				throw outcome.error;
			}
			// Always reject a missing/empty state when a state was expected (CSRF).
			if (expected && outcome.value.state !== expected) {
				throw new Error("OAuth state mismatch — possible CSRF; aborting.");
			}
			this.authorizationCode = outcome.value.code;
		} catch (error) {
			// On ANY early exit (browser-open failure, EADDRINUSE, timeout, state
			// mismatch) ensure the callback server is closed so port 37238 is not
			// held for the full 5-min timeout.
			capture.abort();
			throw error;
		}
	}

	async prepareTokenRequest(): Promise<URLSearchParams> {
		const params = new URLSearchParams({
			grant_type: "authorization_code",
			code: this.authorizationCode,
			code_verifier: this.codeVerifierValue,
			redirect_uri: redirectUrl,
		});
		return params;
	}
}
