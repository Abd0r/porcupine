/**
 * Native browser-use module for Porcupine, built on the Playwright OSS engine.
 *
 * This file is a thin, typed wrapper around `playwright` that the agent can use
 * to navigate, click, type, extract text, screenshot, and evaluate JavaScript on
 * live pages. Every public method returns a clean result string and turns
 * failures (bad URLs, missing elements, timeouts) into readable error messages
 * rather than stack dumps.
 *
 * Design notes:
 * - One active browser + context + page per `BrowserSession` instance. The
 *   session tracks the current URL and page title after every navigation.
 * - Navigation and any network-touching call get a timeout (default 15s,
 *   configurable via `launch({ timeoutMs })` or per-call).
 * - Headed mode is forced when PORCUPINE_BROWSER_VISIBLE=1, otherwise headless.
 * - A noop default session is exported so tools return clean "no page" acks
 *   when no browser has been launched; tools share one singleton session that
 *   the main agent can reset or replace for lifecycle wiring.
 *
 * Playwright must be installed separately; see docs/browser.md. It is a lazy,
 * optional dependency so the rest of Porcupine never needs a browser to be
 * installed.
 */

import { type Browser, type BrowserContext, chromium, type Page } from "playwright";

/** Launch options for opening a Chromium instance. */
export interface BrowserLaunchOptions {
	/** Run headless. Defaults to true unless PORCUPINE_BROWSER_VISIBLE=1. */
	headless?: boolean;
	/** Optional Chromium profile directory to reuse (agent-scoped profile). */
	userDataDir?: string;
	/** Default timeout in milliseconds for navigation/network calls (15s). */
	timeoutMs?: number;
}

/** The browser session the agent tools and the /browser command operate on. */
export class BrowserSession {
	private browser: Browser | null = null;
	private context: BrowserContext | null = null;
	private page: Page | null = null;
	private timeoutMs: number;

	/** Current page URL, or null when no page is open. */
	currentUrlValue: string | null = null;
	/** Current page title, or null when no page is open. */
	currentTitleValue: string | null = null;

	constructor(timeoutMs?: number) {
		this.timeoutMs = timeoutMs ?? 15_000;
	}

	/** True once a page has been launched. */
	isOpen(): boolean {
		return this.page !== null;
	}

	/** Human-readable description of the current session state. */
	status(): string {
		if (!this.isOpen()) {
			return "No browser session open. Call browser_navigate to open a page.";
		}
		const url = this.currentUrlValue ?? "(unknown url)";
		const title = this.currentTitleValue ?? "(unknown title)";
		return `Page: "${title}" at ${url}`;
	}

	/**
	 * Launch Chromium. The browser window opens headed when
	 * PORCUPINE_BROWSER_VISIBLE=1 or `headless` is explicitly false.
	 */
	async launch(options?: BrowserLaunchOptions): Promise<string> {
		if (this.page) {
			// Idempotent: reuse the already-open page.
			return `Browser already open. ${this.status()}`;
		}
		const headless = options?.headless ?? process.env.PORCUPINE_BROWSER_VISIBLE !== "1";
		const timeoutMs = options?.timeoutMs ?? this.timeoutMs;
		try {
			if (options?.userDataDir) {
				this.context = await chromium.launchPersistentContext(options.userDataDir, { headless });
			} else {
				this.browser = await chromium.launch({ headless });
				this.context = await this.browser.newContext();
			}
			this.page = await this.context.newPage();
			this.page.setDefaultTimeout(timeoutMs);
			this.page.setDefaultNavigationTimeout(timeoutMs);
			this.timeoutMs = timeoutMs;
			return `Browser launched (${headless ? "headless" : "headed"}). ${this.status()}`;
		} catch (err) {
			return browserError("launch", err);
		}
	}

	/** Navigate to a URL. Returns the new URL + title on success. */
	async navigate(url: string, timeoutMs?: number): Promise<string> {
		if (!this.page) {
			return noSessionError("navigate");
		}
		const target = url.trim();
		if (!/^https?:\/\//i.test(target)) {
			return `Could not navigate: url must start with http:// or https:// (got "${target}")`;
		}
		try {
			await this.page.goto(target, { timeout: timeoutMs ?? this.timeoutMs, waitUntil: "load" });
			return await this.captureState();
		} catch (err) {
			return `Could not navigate to ${target}: ${errorMessage(err)}`;
		}
	}

	/** Click the first element matching the selector. */
	async click(selector: string): Promise<string> {
		if (!this.page) {
			return noSessionError("click");
		}
		try {
			await this.page.click(selector);
			return `Clicked "${selector}".`;
		} catch (err) {
			return `Could not click "${selector}": ${errorMessage(err)}`;
		}
	}

	/** Type text into the field matched by the selector. */
	async type(selector: string, text: string): Promise<string> {
		if (!this.page) {
			return noSessionError("type");
		}
		try {
			await this.page.fill(selector, text);
			return `Typed into "${selector}".`;
		} catch (err) {
			return `Could not type into "${selector}": ${errorMessage(err)}`;
		}
	}

	/** Extract text from a selector, or the whole page body when omitted. */
	async extractText(selector?: string): Promise<string> {
		if (!this.page) {
			return noSessionError("extract");
		}
		try {
			const text = selector ? await this.page.textContent(selector) : await this.page.locator("body").innerText();
			return `Extracted text:\n${(text ?? "").trim() || "(empty)"}`;
		} catch (err) {
			return `Could not extract text${selector ? ` from "${selector}"` : ""}: ${errorMessage(err)}`;
		}
	}

	/** Take a screenshot. Saves to the given path (or a temp default) and returns the path. */
	async screenshot(path?: string): Promise<string> {
		if (!this.page) {
			return noSessionError("screenshot");
		}
		const dest = path ?? defaultScreenshotPath();
		try {
			await this.page.screenshot({ path: dest, fullPage: true });
			return `Screenshot saved to ${dest}.`;
		} catch (err) {
			return `Could not take screenshot: ${errorMessage(err)}`;
		}
	}

	/** Evaluate a JavaScript expression in the page and stringify the result. */
	async evaluate(expression: string): Promise<string> {
		if (!this.page) {
			return noSessionError("evaluate");
		}
		try {
			const value = await this.page.evaluate(expression);
			return `Evaluated result:\n${stringifyResult(value)}`;
		} catch (err) {
			return `Could not evaluate expression: ${errorMessage(err)}`;
		}
	}

	/** The current page URL as a string (empty when no page is open). */
	currentUrl(): string {
		return this.currentUrlValue ?? "";
	}

	/** Close the browser session and clear tracked state. */
	async close(): Promise<string> {
		try {
			if (this.page) await this.page.close().catch(() => undefined);
			if (this.context) await this.context.close().catch(() => undefined);
			if (this.browser) await this.browser.close().catch(() => undefined);
		} catch {
			// Closing is best-effort; never surface stack dumps.
		}
		this.page = null;
		this.context = null;
		this.browser = null;
		this.currentUrlValue = null;
		this.currentTitleValue = null;
		return "Browser session closed.";
	}

	private async captureState(): Promise<string> {
		const url = this.page?.url() ?? null;
		this.currentUrlValue = url;
		if (this.page) {
			this.currentTitleValue = (await this.page.title().catch(() => "")) || "(untitled)";
		} else {
			this.currentTitleValue = null;
		}
		return this.status();
	}
}

/**
 * A noop session used before any real browser is launched. Every call returns
 * a clean "no browser" ack so tool code never crashes on an unopened session.
 */
export const noopSession: BrowserSession = new BrowserSession(0);

// ============================================================================
// Shared singleton for tools
// ============================================================================

let sharedSession: BrowserSession | null = null;

/** Get the shared browser session, creating the default (noop) one on demand. */
export function getBrowserSession(): BrowserSession {
	if (!sharedSession) {
		sharedSession = noopSession;
	}
	return sharedSession;
}

/** Replace the shared session (e.g. install a fresh instance for a reload). */
export function setBrowserSession(session: BrowserSession): void {
	sharedSession = session;
}

/** Reset the shared session to a fresh noop instance and close any old one. */
export async function resetBrowserSession(): Promise<void> {
	if (sharedSession && sharedSession !== noopSession) {
		await sharedSession.close();
	}
	sharedSession = noopSession;
}

// ============================================================================
// Helpers
// ============================================================================

function browserError(action: string, err: unknown): string {
	return `Could not ${action} browser: ${errorMessage(err)}`;
}

function noSessionError(action: string): string {
	return `No browser session open. Call browser_navigate first to open a page and then ${action}.`;
}

function errorMessage(err: unknown): string {
	if (err instanceof Error) {
		const msg = err.message.replace(/\s+/g, " ").trim();
		return msg || err.name || "unknown error";
	}
	return String(err);
}

function stringifyResult(value: unknown): string {
	if (typeof value === "string") return value || "(empty string)";
	try {
		const s = JSON.stringify(value, null, 2);
		return s === undefined ? String(value) : s;
	} catch {
		return String(value);
	}
}

function defaultScreenshotPath(): string {
	const stamp = new Date()
		.toISOString()
		.replace(/[^0-9]/g, "")
		.slice(0, 14);
	return `browser-${stamp}.png`;
}
