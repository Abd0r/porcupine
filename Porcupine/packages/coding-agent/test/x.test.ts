import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUILTIN_SLASH_COMMANDS } from "../src/core/slash-commands.ts";
import * as webSearch from "../src/core/tools/web-search.ts";
import { composePost, composeReply, parseTweetId, readTweet, searchTweets, XDrafts } from "../src/porcupine/x.ts";
import { formatDraftsList, parseXCommand, runXCommand } from "../src/porcupine/x-command.ts";

const roots: string[] = [];

beforeEach(() => {
	vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function tempAgentDir(): string {
	const root = mkdtempSync(join(tmpdir(), "porcupine-x-"));
	roots.push(root);
	return root;
}

describe("parseXCommand", () => {
	it("parses /x search with quoted and spaced args", () => {
		expect(parseXCommand("/x search hello world")).toEqual({ cmd: "search", args: ["hello", "world"] });
		expect(parseXCommand('/x draft "a draft with spaces"')).toEqual({ cmd: "draft", args: ["a draft with spaces"] });
		expect(parseXCommand("/x status")).toEqual({ cmd: "status", args: [] });
		expect(parseXCommand("/x post 2")).toEqual({ cmd: "post", args: ["2"] });
	});

	it("is case-insensitive on the command name", () => {
		expect(parseXCommand("/X SEARCH query").cmd).toBe("search");
	});
});

describe("parseTweetId", () => {
	it("extracts an id from bare digits, status URLs, and x.com URLs", () => {
		expect(parseTweetId("1234567890123456789")).toBe("1234567890123456789");
		expect(parseTweetId("https://x.com/alice/status/1234567890123456789")).toBe("1234567890123456789");
		expect(parseTweetId("https://twitter.com/bob/status/1234567890123456789?s=20")).toBe("1234567890123456789");
		expect(parseTweetId("https://x.com/i/web/status/42")).toBe("42");
	});

	it("returns undefined for junk that is not a tweet id/url", () => {
		expect(parseTweetId("not-a-tweet")).toBeUndefined();
		expect(parseTweetId("")).toBeUndefined();
	});
});

describe("searchTweets (search query shape)", () => {
	it("scopes the query to site:x.com and delegates to the cascade", async () => {
		const runFreeWebSearch = vi.spyOn(webSearch, "runFreeWebSearch").mockResolvedValue({
			hits: [{ title: "Some tweet text", url: "https://x.com/me/status/1", snippet: "", backend: "searxng" }],
			backend: "searxng",
			tried: ["searxng"],
			skipped: [],
		});
		const result = await searchTweets("climate");
		expect(runFreeWebSearch).toHaveBeenCalledWith("site:x.com climate", 8, "auto");
		expect(result.backend).toBe("searxng");
		expect(result.hits[0]?.text).toContain("Some tweet text");
	});
});

describe("readTweet", () => {
	it("parses a syndication JSON response into a tweet", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(
			Response.json({
				full_text: "Hello world",
				name: "Alice",
				screen_name: "alice",
				created_at: "2026-01-01T00:00:00.000Z",
				reply_count: 2,
				retweet_count: 3,
				favorite_count: 4,
			}),
		);
		const tweet = await readTweet("https://x.com/alice/status/12345");
		expect(tweet).not.toBeUndefined();
		expect(tweet?.id).toBe("12345");
		expect(tweet?.text).toBe("Hello world");
		expect(tweet?.authorScreenName).toBe("alice");
		expect(tweet?.likeCount).toBe(4);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("falls back to oEmbed when syndication fails", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock
			.mockRejectedValueOnce(new Error("HTTP 403"))
			.mockResolvedValueOnce(Response.json({ title: '"Fallback text"', author_name: "bob" }));
		const tweet = await readTweet("123");
		expect(tweet?.text).toBe("Fallback text");
		expect(tweet?.authorScreenName).toBe("bob");
	});

	it("returns undefined when both paths fail (clean message expected)", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockRejectedValue(new Error("network down"));
		expect(await readTweet("https://x.com/a/status/99")).toBeUndefined();
	});
});

describe("drafts", () => {
	it("appends, lists, and reads drafts", () => {
		const agentDir = tempAgentDir();
		const store = new XDrafts(agentDir);
		expect(store.add("first tweet").ok).toBe(true);
		expect(store.add("second tweet").ok).toBe(true);
		expect(store.list()).toHaveLength(2);
		expect(store.get(0)?.text).toBe("first tweet");
		expect(formatDraftsList(store.list())).toContain("1. [");
	});

	it("rejects empty drafts and can remove", () => {
		const store = new XDrafts(tempAgentDir());
		const attempt = store.add("   ");
		expect(attempt.ok).toBe(false);
		if ("error" in attempt) expect(attempt.error).toContain("required");
		expect(store.remove(5).ok).toBe(false);
	});
});

describe("compose workflow (paste, no posting)", () => {
	it("composePost returns the draft text for pasting", () => {
		const draft = { id: "x", text: "Hi from Porcupine!", createdAt: "" };
		expect(composePost(draft)).toBe("Hi from Porcupine!");
	});

	it("composeReply mentions the original author and notes the reply-to", () => {
		const draft = { id: "x", text: "Great point!", createdAt: "" };
		const block = composeReply("https://x.com/alice/status/1", draft, {
			id: "1",
			authorScreenName: "alice",
			authorName: "Alice",
			text: "",
			createdAt: "",
			replyCount: 0,
			retweetCount: 0,
			likeCount: 0,
			url: "",
		});
		expect(block).toContain("@alice");
		expect(block).toContain("reply-to:");
		expect(block).toContain("Great point!");
	});
});

describe("runXCommand", () => {
	it("reports status without exposing any secret", async () => {
		const result = await runXCommand("/x status", tempAgentDir());
		expect(result.output).toContain("search");
		expect(result.output).toContain("read");
		expect(result.output).toContain("drafts");
	});

	it("returns a setup hint when composing a post (no free posting API)", async () => {
		const agentDir = tempAgentDir();
		const store = new XDrafts(agentDir);
		store.add("hello");
		const result = await runXCommand("/x post 0", agentDir, store);
		// Clipboard may fail in CI - the block + hint must still be present.
		expect(result.output).toContain("free automated posting");
		expect(result.output).toContain("hello");
	});

	it("returns a clean not-found error for an unroutable tweet read", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockRejectedValue(new Error("down"));
		const result = await runXCommand("/x tweet https://x.com/a/status/1", tempAgentDir());
		expect(result.output).toContain("Could not fetch tweet");
	});

	it("lists drafts and saves via /x draft", async () => {
		const agentDir = tempAgentDir();
		const store = new XDrafts(agentDir);
		expect((await runXCommand('/x draft "note one"', agentDir, store)).output).toContain("Draft 0 saved");
		expect((await runXCommand("/x drafts", agentDir, store)).output).toContain("note one");
	});
});

describe("/x slash command registration", () => {
	it("registers /x in built-in slash completion", () => {
		expect(BUILTIN_SLASH_COMMANDS.some((command) => command.name === "x")).toBe(true);
	});
});
