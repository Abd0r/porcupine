/**
 * '/x' slash command: free-tier X (Twitter) access for Porcupine.
 *
 *   /x status                      what is available (no secrets)
 *   /x search <query>              free web_search scoped to site:x.com
 *   /x tweet <id-or-url>           read a tweet (free)
 *   /x draft "text"                append a local draft
 *   /x drafts                      list local drafts
 *   /x post <draftIndex>           compose + copy a draft to paste on x.com
 *   /x reply <tweetUrl> <idx>      compose + copy a reply to paste on x.com
 *
 * Search, read, and drafts are fully free. Posting is compose-then-paste
 * because X removed its free automated posting tier.
 */

import { copyToClipboard } from "../utils/clipboard.ts";
import { readTweet, searchTweets, XDrafts } from "./x.ts";

/** Parse '/x ...' arguments into a normalized subcommand + args array. */
export function parseXCommand(text: string): { cmd: string; args: string[] } {
	const trimmed = text.trim();
	const withoutPrefix = trimmed.replace(/^\/x\b/i, "").trim();

	// Tokenize the quoted draft carefully: /x draft "some text", /x post 2.
	const tokens: string[] = [];
	let current = "";
	let inQuote = false;
	for (const char of withoutPrefix) {
		if (char === '"') {
			inQuote = !inQuote;
			continue;
		}
		if (char === " " && !inQuote) {
			if (current) {
				tokens.push(current);
				current = "";
			}
			continue;
		}
		current += char;
	}
	if (current) tokens.push(current);

	const [cmd, ...args] = tokens;
	return { cmd: (cmd ?? "").toLowerCase(), args };
}

export function formatDraftsList(drafts: { id: string; text: string; createdAt: string }[]): string {
	if (drafts.length === 0) {
		return "No drafts yet. Save one with '/x draft \"text\"'.";
	}
	const lines = drafts.map(
		(draft, index) => `${index}. [${draft.id}] ${draft.text.replace(/\s+/g, " ").slice(0, 140)}`,
	);
	return lines.join("\n");
}

export function formatStatus(): string {
	return [
		"X integration status (free route)",
		"  search   free: web_search cascade scoped to site:x.com",
		"  read     free: public syndication JSON + oEmbed fallback",
		`  drafts   local file: ${new XDrafts().agentDir}/x/drafts.json`,
		"  post     compose-then-paste (X has no free automated posting API)",
	].join("\n");
}

export function formatSetupHint(): string {
	return (
		"X removed its free automated posting tier (Feb 2026). Porcupine " +
		"composes tweets and replies for you to paste on x.com. " +
		"Search, read, and drafts need no credentials."
	);
}

export interface XCommandResult {
	output: string;
	copied?: boolean;
}

export async function runXCommand(text: string, agentDir?: string, drafts?: XDrafts): Promise<XCommandResult> {
	const { cmd, args } = parseXCommand(text);
	const store = drafts ?? new XDrafts(agentDir);
	const list = store.list();

	switch (cmd) {
		case "status":
		case "":
			return { output: formatStatus() };

		case "search": {
			const query = args.join(" ").trim();
			if (!query) {
				return { output: "Usage: /x search <query>" };
			}
			try {
				const { hits, backend } = await searchTweets(query);
				if (hits.length === 0) {
					return { output: `web_search (${backend}) returned no x.com hits for: ${query}` };
				}
				const lines = hits.map((hit, i) => `${i + 1}. ${hit.text.split("\n")[0] || "(no title)"}\n   ${hit.url}`);
				return { output: [`X search via web_search (${backend})`, ...lines].join("\n") };
			} catch (error) {
				return { output: `Search failed: ${error instanceof Error ? error.message : String(error)}` };
			}
		}

		case "tweet":
		case "read": {
			const target = args[0]?.trim();
			if (!target) {
				return { output: "Usage: /x tweet <id-or-url>" };
			}
			const tweet = await readTweet(target);
			if (!tweet) {
				return {
					output: `Could not fetch tweet (rate-limited or deleted): ${target}`,
				};
			}
			const lines = [
				`@${tweet.authorScreenName} (${tweet.authorName})`,
				tweet.text,
				"",
				`${tweet.url}  ·  ${tweet.likeCount} likes, ${tweet.retweetCount} retweets, ${tweet.replyCount} replies`,
			];
			return { output: lines.join("\n") };
		}

		case "draft":
		case "add": {
			const draftText = args.join(" ").trim();
			if (!draftText) {
				return { output: 'Usage: /x draft "text"' };
			}
			const result = store.add(draftText);
			if (!result.ok) return { output: result.error };
			return { output: `Draft ${list.length} saved (${result.draft.id})` };
		}

		case "drafts":
		case "list": {
			return { output: formatDraftsList(list) };
		}

		case "post": {
			const index = Number.parseInt(args[0] ?? "", 10);
			const draft = Number.isInteger(index) ? store.get(index) : undefined;
			if (!draft) {
				return { output: "Usage: /x post <draftIndex> (see '/x drafts' for indices)" };
			}
			const block = draft.text.trim();
			let copied = false;
			try {
				await copyToClipboard(block);
				copied = true;
			} catch {
				// Clipboard unavailable - still print the block.
			}
			const output = [
				formatSetupHint(),
				"",
				block,
				"",
				`Copied to clipboard: ${copied ? "yes" : "no (copy the block above)"}`,
			].join("\n");
			return { output, copied };
		}

		case "reply": {
			const tweetUrl = args[0]?.trim();
			const index = Number.parseInt(args[1] ?? "", 10);
			if (!tweetUrl || !Number.isInteger(index)) {
				return { output: "Usage: /x reply <tweetUrl> <draftIndex>" };
			}
			const draft = store.get(index);
			if (!draft) {
				return { output: `No draft at index ${index} (see '/x drafts')` };
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
				// Clipboard unavailable - still print the block.
			}
			const output = [
				formatSetupHint(),
				`reply-to: ${tweetUrl}`,
				"",
				block,
				"",
				`Copied to clipboard: ${copied ? "yes" : "no (copy the block above)"}`,
			].join("\n");
			return { output, copied };
		}

		default:
			return { output: `Unknown /x subcommand: ${cmd}. Try status, search, tweet, draft, drafts, post, reply.` };
	}
}
