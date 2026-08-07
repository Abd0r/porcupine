/**
 * Free-tier X (Twitter) integration for Porcupine.
 *
 * X discontinued its free developer API tier (Feb 2026): the only automated
 * posting path is pay-per-use. So this module implements the fully FREE
 * surface only:
 *
 *   - search:      web_search cascade scoped to 'site:x.com' (no key)
 *   - readTweet:   public syndication JSON + oEmbed fallback (no key)
 *   - drafts:      a local drafts file under the agent home (always works)
 *   - composePost / composeReply: build the exact tweet text as a copy-paste
 *     block. Nothing is ever posted from here - the user pastes it on x.com.
 *
 * No OAuth, no token exchange, no /2/tweets write calls.
 */

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import lockfile from "proper-lockfile";
import { getAgentDir } from "../config.ts";
import { runFreeWebSearch, type WebSearchHit } from "../core/tools/web-search.ts";

// ============================================================================
// Reading tweets
// ============================================================================

export interface TweetResult {
	id: string;
	text: string;
	authorName: string;
	authorScreenName: string;
	createdAt: string;
	replyCount: number;
	retweetCount: number;
	likeCount: number;
	url: string;
}

/** Extract a numeric tweet id from '123', 'status/123', or a full tweet URL. */
export function parseTweetId(input: string): string | undefined {
	const candidate = input.trim();
	if (/^\d{1,19}$/.test(candidate)) return candidate;
	const match = /(?:x\.com|twitter\.com)\/(?:[^/]+\/status\/|i\/status\/|.*\/status\/)(\d{1,19})/.exec(candidate);
	return match ? match[1] : undefined;
}

/** Build a canonical x.com URL for a tweet id. */
export function tweetUrlFromId(id: string): string {
	return `https://x.com/i/web/status/${id}`;
}

interface SyndicatedTweet {
	full_text?: string;
	created_at?: string;
	name?: string;
	screen_name?: string;
	user?: { name?: string; screen_name?: string };
	reply_count?: number;
	retweet_count?: number;
	favorite_count?: number;
	id_str?: string;
}

interface OembedTweet {
	title?: string;
	author_name?: string;
	author_url?: string;
	html?: string;
}

async function fetchJson(url: string, timeoutMs: number): Promise<Record<string, unknown>> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(url, {
			signal: controller.signal,
			headers: {
				"User-Agent": "Porcupine/0.83 (+free-x-read; syndication/oembed)",
				Accept: "application/json, text/html;q=0.9,*/*;q=0.8",
			},
			redirect: "follow",
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		return (await res.json()) as Record<string, unknown>;
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Fetch a tweet's public text + metrics. Tries the syndication JSON endpoint
 * first, then oEmbed. Both are unauthenticated and free. Returns `undefined`
 * (not a throw) when neither works, so callers can report a clean message.
 */
export async function readTweet(idOrUrl: string): Promise<TweetResult | undefined> {
	const id = parseTweetId(idOrUrl);
	if (!id) return undefined;

	// Path 1: syndicated public tweet-result JSON.
	try {
		const data = (await fetchJson(
			`https://cdn.syndication.twimg.com/tweet-result?id=${encodeURIComponent(id)}&lang=en`,
			10_000,
		)) as SyndicatedTweet;
		const text = data.full_text?.trim();
		if (text) {
			const screenName = data.screen_name ?? data.user?.screen_name ?? "unknown";
			return {
				id,
				text,
				authorName: data.name ?? data.user?.name ?? screenName,
				authorScreenName: screenName,
				createdAt: data.created_at ?? "",
				replyCount: data.reply_count ?? 0,
				retweetCount: data.retweet_count ?? 0,
				likeCount: data.favorite_count ?? 0,
				url: tweetUrlFromId(id),
			};
		}
	} catch {
		// Fall through to oEmbed.
	}

	// Path 2: oEmbed (title carries the tweet text + author).
	try {
		const data = (await fetchJson(
			`https://publish.twitter.com/oembed?url=${encodeURIComponent(tweetUrlFromId(id))}`,
			10_000,
		)) as OembedTweet;
		const title = data.title?.trim();
		if (title) {
			const authorName = data.author_name ?? data.author_url?.split("/").filter(Boolean).pop() ?? "unknown";
			return {
				id,
				text: title.replace(/^"|"$/g, ""),
				authorName,
				authorScreenName: authorName,
				createdAt: "",
				replyCount: 0,
				retweetCount: 0,
				likeCount: 0,
				url: tweetUrlFromId(id),
			};
		}
	} catch {
		// Both paths failed.
	}

	return undefined;
}

// ============================================================================
// Search via web_search (site:x.com)
// ============================================================================

export interface XSearchHit {
	text: string;
	url: string;
	backend: string;
}

/**
 * Free X search: run the web_search cascade scoped to 'site:x.com'. No API
 * key, no paid search API - the work is delegated to the existing free
 * cascade and results are the tweet-ish hits the search engine surfaces.
 */
export async function searchTweets(
	query: string,
	limit = 8,
): Promise<{ hits: XSearchHit[]; backend: string; tried: string[]; skipped: string[] }> {
	const scoped = `site:x.com ${query}`.trim();
	const result = await runFreeWebSearch(scoped, limit, "auto");
	const hits = result.hits.map((hit: WebSearchHit) => ({
		text: hit.title || "",
		url: hit.url.replace(/^\S+\/url\?q=/i, ""),
		backend: hit.backend,
	}));
	return { hits, backend: result.backend, tried: result.tried, skipped: result.skipped };
}

// ============================================================================
// Local drafts
// ============================================================================

export interface DraftEntry {
	id: string;
	text: string;
	createdAt: string;
}

export interface DraftsData {
	version: 1;
	drafts: DraftEntry[];
}

function draftsPath(agentDir: string): string {
	return join(agentDir, "x", "drafts.json");
}

function readDrafts(agentDir: string): DraftsData {
	try {
		const parsed = JSON.parse(readFileSync(draftsPath(agentDir), "utf8")) as DraftsData;
		if (!Array.isArray(parsed.drafts)) throw new Error("invalid drafts shape");
		return { version: 1, drafts: parsed.drafts };
	} catch {
		return { version: 1, drafts: [] };
	}
}

function atomicWrite(agentDir: string, data: DraftsData): void {
	const path = draftsPath(agentDir);
	mkdirSync(dirname(path), { recursive: true });
	const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
	try {
		writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
		renameSync(temporary, path);
	} finally {
		try {
			rmSync(temporary, { force: true });
		} catch {
			// Best-effort cleanup.
		}
	}
}

/**
 * Durable local X drafts store. Lives at <agentDir>/x/drafts.json, atomic
 * writes under a directory lock. Works with zero credentials - it is the
 * core of the compose-then-paste workflow.
 */
export class XDrafts {
	readonly agentDir: string;

	constructor(agentDir: string = getAgentDir()) {
		this.agentDir = agentDir;
	}

	private mutate<T>(operation: (data: DraftsData) => T): T {
		const path = draftsPath(this.agentDir);
		mkdirSync(dirname(path), { recursive: true });
		const release = lockfile.lockSync(dirname(path), {
			lockfilePath: join(dirname(path), ".xdrafts.lock"),
			realpath: false,
			retries: { retries: 0 },
			stale: 30_000,
		});
		try {
			const data = readDrafts(this.agentDir);
			const result = operation(data);
			atomicWrite(this.agentDir, data);
			return result;
		} finally {
			release();
		}
	}

	list(): DraftEntry[] {
		return readDrafts(this.agentDir).drafts;
	}

	add(text: string): { ok: true; draft: DraftEntry } | { ok: false; error: string } {
		const clean = text.trim();
		if (!clean) return { ok: false, error: "draft text is required" };
		return this.mutate((data) => {
			const draft: DraftEntry = {
				id: randomUUID().slice(0, 8),
				text: clean,
				createdAt: new Date().toISOString(),
			};
			data.drafts.push(draft);
			return { ok: true as const, draft };
		});
	}

	get(index: number): DraftEntry | undefined {
		return readDrafts(this.agentDir).drafts[index];
	}

	remove(index: number): { ok: true } | { ok: false; error: string } {
		return this.mutate((data) => {
			if (index < 0 || index >= data.drafts.length) {
				return { ok: false as const, error: `no draft at index ${index}` };
			}
			data.drafts.splice(index, 1);
			return { ok: true as const };
		});
	}
}

// ============================================================================
// Compose-then-paste (the "posting" path - no credentials because there is
// no free automated post API anymore).
// ============================================================================

export const POST_SETUP_NOTE =
	"X no longer offers a free automated posting API (pay-per-use is the only option). Porcupine composes the tweet for you and copies it to your clipboard - paste it on x.com to publish.";

/** Compose a plain post from a local draft as a copy-paste block. */
export function composePost(draft: DraftEntry): string {
	return draft.text.trim();
}

/**
 * Compose a reply that mentions the original author, prefixed with a reply-to
 * reference line, as a copy-paste block.
 */
export function composeReply(tweetUrl: string, draft: DraftEntry, target?: TweetResult): string {
	const creator = target?.authorScreenName ?? target?.authorName;
	const lines: string[] = [];
	if (creator) {
		lines.push(`@${creator.replace(/^@/, "")}`);
	}
	lines.push(draft.text.trim());
	const block = lines.join("\n");
	if (tweetUrl.trim()) {
		return `reply-to: ${tweetUrl.trim()}\n\n${block}`;
	}
	return block;
}
