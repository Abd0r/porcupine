import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock Playwright so these tests never launch a real browser.
const _pageCtrls: { [k in string]: ReturnType<typeof vi.fn> } = {} as never;

vi.mock("playwright", () => {
	const makePage = () => {
		const page = {
			setDefaultTimeout: vi.fn(),
			setDefaultNavigationTimeout: vi.fn(),
			url: vi.fn().mockReturnValue("https://example.com"),
			title: vi.fn().mockResolvedValue("Example"),
			goto: vi.fn().mockResolvedValue(null),
			click: vi.fn().mockResolvedValue(undefined),
			fill: vi.fn().mockResolvedValue(undefined),
			textContent: vi.fn().mockResolvedValue("Hello page"),
			locator: vi.fn().mockReturnValue({ innerText: vi.fn().mockResolvedValue("Body text") }),
			screenshot: vi.fn().mockResolvedValue(Buffer.from("png")),
			evaluate: vi.fn().mockImplementation(async (expr: string) => ({ expr })),
			close: vi.fn().mockResolvedValue(undefined),
		};
		return page;
	};
	const makeContext = () => ({
		newPage: vi.fn(() => Promise.resolve(makePage())),
		close: vi.fn().mockResolvedValue(undefined),
	});
	const makeBrowser = () => ({
		newContext: vi.fn(() => Promise.resolve(makeContext())),
		close: vi.fn().mockResolvedValue(undefined),
	});
	return {
		chromium: {
			launch: vi.fn(() => Promise.resolve(makeBrowser())),
			launchPersistentContext: vi.fn(() => Promise.resolve(makeContext())),
		},
	};
});

import * as playwright from "playwright";
import {
	createBrowserClickToolDefinition,
	createBrowserEvaluateToolDefinition,
	createBrowserExtractToolDefinition,
	createBrowserNavigateToolDefinition,
	createBrowserScreenshotToolDefinition,
	createBrowserTypeToolDefinition,
} from "../src/core/tools/browser.ts";
import { BrowserSession, getBrowserSession, resetBrowserSession } from "../src/porcupine/browser.ts";

const chromiumMock = playwright.chromium as unknown as {
	launch: ReturnType<typeof vi.fn>;
};

function accessibleKeys(obj: unknown): string[] {
	return Object.keys(obj as object);
}

describe("browser tool definitions", () => {
	it("has the six browser tools with correct names", () => {
		expect(createBrowserNavigateToolDefinition().name).toBe("browser_navigate");
		expect(createBrowserClickToolDefinition().name).toBe("browser_click");
		expect(createBrowserTypeToolDefinition().name).toBe("browser_type");
		expect(createBrowserExtractToolDefinition().name).toBe("browser_extract");
		expect(createBrowserScreenshotToolDefinition().name).toBe("browser_screenshot");
		expect(createBrowserEvaluateToolDefinition().name).toBe("browser_evaluate");
	});

	it("navigate schema requires url", () => {
		const schema = createBrowserNavigateToolDefinition().parameters as { required?: string[]; properties: object };
		expect(schema.required).toContain("url");
		expect(accessibleKeys(schema.properties)).toContain("url");
	});

	it("click schema requires selector", () => {
		const schema = createBrowserClickToolDefinition().parameters as { required?: string[]; properties: object };
		expect(schema.required).toContain("selector");
	});

	it("type schema requires selector and text", () => {
		const schema = createBrowserTypeToolDefinition().parameters as { required?: string[] };
		expect(schema.required).toEqual(["selector", "text"]);
	});

	it("extract's selector is optional", () => {
		const schema = createBrowserExtractToolDefinition().parameters as { required?: string[]; properties: object };
		expect(schema.required ?? []).not.toContain("selector");
		expect(accessibleKeys(schema.properties)).toContain("selector");
	});

	it("screenshot's path is optional", () => {
		const schema = createBrowserScreenshotToolDefinition().parameters as { required?: string[] };
		expect(schema.required ?? []).not.toContain("path");
	});

	it("evaluate schema requires expression", () => {
		const schema = createBrowserEvaluateToolDefinition().parameters as { required?: string[] };
		expect(schema.required).toContain("expression");
	});
});

describe("BrowserSession wrapper", () => {
	let page: {
		click: ReturnType<typeof vi.fn>;
	};

	beforeEach(async () => {
		vi.clearAllMocks();
		chromiumMock.launch.mockClear();
	});

	afterEach(async () => {
		await resetBrowserSession();
	});

	async function openSession(): Promise<{ session: BrowserSession; mocks: any }> {
		const session = new BrowserSession(500);
		const _result = await session.launch({ headless: true, timeoutMs: 500 });
		const browser = await chromiumMock.launch.mock.results.at(-1)?.value;
		const context = await browser.newContext.mock.results.at(-1)?.value;
		page = await context.newPage.mock.results.at(-1)?.value;
		return { session, mocks: { browser, context, page } };
	}

	it("launches headless and exposes status", async () => {
		const { session } = await openSession();
		expect(chromiumMock.launch).toHaveBeenCalled();
		expect(session.isOpen()).toBe(true);
		expect(session.status()).toContain("Page:");
		await session.close();
	});

	it("navigate reaches a page and tracks url + title", async () => {
		const { session } = await openSession();
		const out = await session.navigate("https://example.com");
		expect(out).toContain("https://example.com");
		expect(session.currentUrl()).toBe("https://example.com");
		expect(session.currentTitleValue).toBe("Example");
		await session.close();
	});

	it("navigate rejects a badly-formed url with a readable message", async () => {
		const { session } = await openSession();
		const out = await session.navigate("example.com");
		expect(out).toContain("url must start with http:// or https://");
		await session.close();
	});

	it("click returns an ack", async () => {
		const { session } = await openSession();
		const out = await session.click("#btn");
		expect(out).toContain("Clicked");
		await session.close();
	});

	it("click surfaces a missing-element error readably", async () => {
		const { session } = await openSession();
		page.click.mockRejectedValueOnce(new Error("Timeout 500ms exceeded"));
		const out = await session.click("#missing");
		expect(out).toContain("Could not click");
		expect(out).toContain("Timeout");
		await session.close();
	});

	it("type returns an ack", async () => {
		const { session } = await openSession();
		const out = await session.type("#input", "hi");
		expect(out).toContain("Typed");
		await session.close();
	});

	it("extractText extracts body text when no selector", async () => {
		const { session } = await openSession();
		const out = await session.extractText();
		expect(out).toContain("Body text");
		await session.close();
	});

	it("extractText extracts selector text when provided", async () => {
		const { session } = await openSession();
		const out = await session.extractText(".heading");
		expect(out).toContain("Hello page");
		await session.close();
	});

	it("screenshot returns a saved path", async () => {
		const { session } = await openSession();
		const out = await session.screenshot("/tmp/shot.png");
		expect(out).toContain("/tmp/shot.png");
		await session.close();
	});

	it("evaluate returns a stringified result", async () => {
		const { session } = await openSession();
		const out = await session.evaluate("() => 1 + 1");
		expect(out).toContain("Evaluated result");
		await session.close();
	});

	it("operations without a session return a readable no-browser message", async () => {
		const session = new BrowserSession(500);
		expect(await session.click("#x")).toContain("No browser session open");
		expect(await session.navigate("https://example.com")).toContain("No browser session open");
	});
});

describe("tool execution through shared session", () => {
	afterEach(async () => {
		await resetBrowserSession();
	});

	it("click tool returns an ack via the shared session", async () => {
		const session = new BrowserSession(500);
		await session.launch({ headless: true, timeoutMs: 500 });
		// replace shared singleton with our opened session
		const mod = await import("../src/porcupine/browser.ts");
		(mod as { setBrowserSession: (s: BrowserSession) => void }).setBrowserSession(session);
		const res = await createBrowserClickToolDefinition().execute(
			"id",
			{ selector: "#btn" },
			undefined,
			undefined,
			undefined as never,
		);
		const first = res.content[0] as { type: "text"; text: string };
		expect(first.text).toContain("Clicked");
		await session.close();
	});
});

describe("shared session singleton", () => {
	afterEach(async () => {
		await resetBrowserSession();
	});

	it("getBrowserSession returns a default noop session and resets replace it", async () => {
		await resetBrowserSession();
		const first = getBrowserSession();
		expect(first.isOpen()).toBe(false);
		const replacement = new BrowserSession();
		const mod = await import("../src/porcupine/browser.ts");
		(mod as { setBrowserSession: (s: BrowserSession) => void }).setBrowserSession(replacement);
		expect(getBrowserSession()).toBe(replacement);
		await resetBrowserSession();
		expect(getBrowserSession()).not.toBe(replacement);
	});
});
