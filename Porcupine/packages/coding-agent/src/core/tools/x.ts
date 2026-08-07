/**
 * Free-tier X (Twitter) agent tools for Porcupine.
 *
 *   x_search(query)      free web_search scoped to site:x.com
 *   x_read(idOrUrl)      read a tweet (free, syndication JSON + oEmbed)
 *   x_draft(text)        append a local draft
 *   x_post(draftIndex)   compose + copy a draft (paste on x.com)
 *   x_reply(tweetUrl, i) compose + copy a reply (paste on x.com)
 *
 * Everything is free. Posting is compose-then-paste because X removed its
 * free automated posting tier. Always returns readable acks/errors, never
 * secrets, never posts anywhere.
 */

import type { AgentTool } from "@porcupineai/agent-core";
import { Text } from "@porcupineai/tui";
import { type Static, Type } from "typebox";
import { getAgentDir } from "../../config.ts";
import { theme } from "../../modes/interactive/theme/theme.ts";
import { readTweet, searchTweets, type TweetResult, XDrafts } from "../../porcupine/x.ts";
import { copyToClipboard } from "../../utils/clipboard.ts";
import type { ToolDefinition } from "../extensions/types.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

const xSearchSchema = Type.Object({
	query: Type.String({ description: "Search query" }),
	limit: Type.Optional(Type.Number({ description: "Max results (default 8)" })),
});

const xReadSchema = Type.Object({
	idOrUrl: Type.String({ description: "Tweet id or x.com/twitter.com URL" }),
});

const xDraftSchema = Type.Object({
	text: Type.String({ description: "Draft post text" }),
});

const xPostSchema = Type.Object({
	draftIndex: Type.Number({ description: "Index into the local X drafts list (see x_draft listing)" }),
});

const xReplySchema = Type.Object({
	tweetUrl: Type.String({ description: "x.com/twitter.com URL of the tweet to reply to" }),
	draftIndex: Type.Number({ description: "Index into the local X drafts list" }),
});

export type XSearchToolInput = Static<typeof xSearchSchema>;
export type XReadToolInput = Static<typeof xReadSchema>;
export type XDraftToolInput = Static<typeof xDraftSchema>;
export type XPostToolInput = Static<typeof xPostSchema>;
export type XReplyToolInput = Static<typeof xReplySchema>;

export interface XToolDetails {
	kind: "search" | "read" | "draft" | "post" | "reply";
	count?: number;
	backend?: string;
	copied?: boolean;
}

export interface XToolsOptions {
	/** Agent home (~/.porcupine/agent). Defaults to getAgentDir(). */
	agentDir?: string;
	/** Drafts store override (tests). */
	drafts?: XDrafts;
}

function formatTweet(tweet: TweetResult): string {
	return [
		`@${tweet.authorScreenName} (${tweet.authorName})`,
		tweet.text,
		"",
		`${tweet.url}  ·  ${tweet.likeCount} likes, ${tweet.retweetCount} retweets, ${tweet.replyCount} replies`,
	].join("\n");
}

const postNice =
	"X no longer offers a free automated posting API (pay-per-use is the only automated option). " +
	"Porcupine composed this for you to paste on x.com:";

export function createXSearchToolDefinition(
	_options?: XToolsOptions,
): ToolDefinition<typeof xSearchSchema, XToolDetails | undefined> {
	return {
		name: "x_search",
		label: "x_search",
		description:
			"Search X (Twitter) using the free web_search cascade scoped to site:x.com. No API key. Returns tweet-ish hits (title + URL). Prefer over the paid X search API (not used).",
		promptSnippet: "Free X search (web_search scoped to site:x.com)",
		promptGuidelines: [
			"Use x_search when you need current X posts for a topic. It delegates to the free search cascade.",
			"After a hit, use x_read on the tweet URL when you need the full text and metrics.",
		],
		parameters: xSearchSchema,
		async execute(_toolCallId, { query, limit }) {
			try {
				const result = await searchTweets(query, limit);
				const lines = result.hits.map(
					(hit, i) => `${i + 1}. ${hit.text.split("\n")[0] || "(no title)"}\n   ${hit.url}`,
				);
				const text =
					lines.length === 0
						? `No x.com hits for: ${query}`
						: [`X search via web_search (${result.backend})`, ...lines].join("\n");
				return {
					content: [{ type: "text" as const, text }],
					details: { kind: "search", count: result.hits.length, backend: result.backend },
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
					details: { kind: "search" },
				};
			}
		},
		renderCall(args) {
			return new Text(
				`${theme.fg("toolTitle", theme.bold("x_search"))} ${theme.fg("toolOutput", args?.query ?? "")}`,
				0,
				0,
			);
		},
		renderResult(result) {
			const text = (result.content ?? [])
				.map((c) => (c.type === "text" ? c.text : ""))
				.join("")
				.trim();
			return new Text(theme.fg("toolOutput", text || "(no results)"), 0, 0);
		},
	};
}

export function createXReadToolDefinition(
	options?: XToolsOptions,
): ToolDefinition<typeof xReadSchema, XToolDetails | undefined> {
	void options;
	return {
		name: "x_read",
		label: "x_read",
		description:
			"Read a tweet's public text + metrics (likes, retweets, replies). Free: public syndication JSON with oEmbed fallback. No API key. Returns a clean error if the tweet is rate-limited or deleted.",
		promptSnippet: "Read a tweet (free, no key)",
		promptGuidelines: ["Use x_read with a tweet id or x.com/twitter.com URL when you need its full text."],
		parameters: xReadSchema,
		async execute(_toolCallId, { idOrUrl }) {
			const tweet = await readTweet(idOrUrl);
			if (!tweet) {
				return {
					content: [
						{ type: "text" as const, text: `Could not fetch tweet (rate-limited or deleted): ${idOrUrl}` },
					],
					details: { kind: "read" },
				};
			}
			return { content: [{ type: "text" as const, text: formatTweet(tweet) }], details: { kind: "read" } };
		},
		renderCall(args) {
			return new Text(
				`${theme.fg("toolTitle", theme.bold("x_read"))} ${theme.fg("toolOutput", args?.idOrUrl ?? "")}`,
				0,
				0,
			);
		},
		renderResult(result) {
			const text = (result.content ?? [])
				.map((c) => (c.type === "text" ? c.text : ""))
				.join("")
				.trim();
			return new Text(theme.fg("toolOutput", text || "(no tweet)"), 0, 0);
		},
	};
}

export function createXDraftToolDefinition(
	options?: XToolsOptions,
): ToolDefinition<typeof xDraftSchema, XToolDetails | undefined> {
	const getDrafts = (): XDrafts => options?.drafts ?? new XDrafts(options?.agentDir ?? getAgentDir());
	return {
		name: "x_draft",
		label: "x_draft",
		description:
			"Append a draft X post to the local drafts file. Free, works with no credentials. Later use x_post / x_reply to compose it for pasting on x.com.",
		promptSnippet: "Save an X draft (free, local)",
		promptGuidelines: ["Save texts you plan to publish as drafts, then compose with x_post / x_reply."],
		parameters: xDraftSchema,
		async execute(_toolCallId, { text }) {
			const result = getDrafts().add(text);
			if (!result.ok) {
				return { content: [{ type: "text" as const, text: result.error }], details: { kind: "draft" } };
			}
			return {
				content: [{ type: "text" as const, text: `Draft saved: ${result.draft.id}` }],
				details: { kind: "draft" },
			};
		},
		renderCall() {
			return new Text(theme.fg("toolTitle", theme.bold("x_draft")), 0, 0);
		},
		renderResult() {
			return new Text(theme.fg("accent", "Draft saved"), 0, 0);
		},
	};
}

export function createXPostToolDefinition(
	options?: XToolsOptions,
): ToolDefinition<typeof xPostSchema, XToolDetails | undefined> {
	const getDrafts = (): XDrafts => options?.drafts ?? new XDrafts(options?.agentDir ?? getAgentDir());
	return {
		name: "x_post",
		label: "x_post",
		description:
			"Compose a draft X post as a copy-paste block (X has no free automated posting API). Returns the tweet text and copies it to your clipboard for pasting on x.com. Never posts automatically.",
		promptSnippet: "Compose an X draft to paste (no free posting API → copy-paste)",
		promptGuidelines: [
			"Use x_post to produce a ready-to-paste tweet. It copies to the clipboard; the user pastes on x.com.",
		],
		parameters: xPostSchema,
		async execute(_toolCallId, { draftIndex }) {
			const draft = getDrafts().get(draftIndex);
			if (!draft) {
				return {
					content: [
						{ type: "text" as const, text: `No draft at index ${draftIndex}. Save one with x_draft first.` },
					],
					details: { kind: "post" },
				};
			}
			const block = draft.text.trim();
			let copied = false;
			try {
				await copyToClipboard(block);
				copied = true;
			} catch {
				// Fall through - still return the block.
			}
			return {
				content: [
					{
						type: "text" as const,
						text: [
							postNice,
							"",
							block,
							"",
							`Copied to clipboard: ${copied ? "yes" : "no (copy the block)"}`,
						].join("\n"),
					},
				],
				details: { kind: "post", copied },
			};
		},
		renderCall(args) {
			return new Text(`${theme.fg("toolTitle", theme.bold("x_post"))} #${args?.draftIndex ?? "?"}`, 0, 0);
		},
		renderResult() {
			return new Text(theme.fg("accent", "Composed for pasting"), 0, 0);
		},
	};
}

export function createXReplyToolDefinition(
	options?: XToolsOptions,
): ToolDefinition<typeof xReplySchema, XToolDetails | undefined> {
	const getDrafts = (): XDrafts => options?.drafts ?? new XDrafts(options?.agentDir ?? getAgentDir());
	return {
		name: "x_reply",
		label: "x_reply",
		description:
			"Compose a reply to an X tweet from a draft, prefixed with the author's mention, as a copy-paste block. Reads the tweet for its author. X has no free automated posting API, so the block is copied for pasting on x.com.",
		promptSnippet: "Compose an X reply to paste (copy-paste)",
		promptGuidelines: [
			"Use x_reply to build a ready-to-paste reply that mentions the original author. The user pastes on x.com.",
		],
		parameters: xReplySchema,
		async execute(_toolCallId, { tweetUrl, draftIndex }) {
			const draft = getDrafts().get(draftIndex);
			if (!draft) {
				return {
					content: [
						{ type: "text" as const, text: `No draft at index ${draftIndex}. Save one with x_draft first.` },
					],
					details: { kind: "reply" },
				};
			}
			const target = await readTweet(tweetUrl);
			const block = target
				? `@${target.authorScreenName.replace(/^@/, "")}\n${draft.text.trim()}`
				: draft.text.trim();
			let copied = false;
			try {
				await copyToClipboard(block);
				copied = true;
			} catch {
				// Fall through - still return the block.
			}
			return {
				content: [
					{
						type: "text" as const,
						text: [
							postNice,
							`reply-to: ${tweetUrl}`,
							"",
							block,
							"",
							`Copied to clipboard: ${copied ? "yes" : "no (copy the block)"}`,
						].join("\n"),
					},
				],
				details: { kind: "reply", copied },
			};
		},
		renderCall(args) {
			return new Text(
				`${theme.fg("toolTitle", theme.bold("x_reply"))} ${theme.fg("toolOutput", args?.tweetUrl ?? "")} #${args?.draftIndex ?? "?"}`,
				0,
				0,
			);
		},
		renderResult() {
			return new Text(theme.fg("accent", "Reply composed for pasting"), 0, 0);
		},
	};
}

export function createXSearchTool(options?: XToolsOptions): AgentTool<typeof xSearchSchema> {
	return wrapToolDefinition(createXSearchToolDefinition(options));
}
export function createXReadTool(options?: XToolsOptions): AgentTool<typeof xReadSchema> {
	return wrapToolDefinition(createXReadToolDefinition(options));
}
export function createXDraftTool(options?: XToolsOptions): AgentTool<typeof xDraftSchema> {
	return wrapToolDefinition(createXDraftToolDefinition(options));
}
export function createXPostTool(options?: XToolsOptions): AgentTool<typeof xPostSchema> {
	return wrapToolDefinition(createXPostToolDefinition(options));
}
export function createXReplyTool(options?: XToolsOptions): AgentTool<typeof xReplySchema> {
	return wrapToolDefinition(createXReplyToolDefinition(options));
}
