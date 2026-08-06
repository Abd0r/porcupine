/**
 * Free web page extract — plain HTTP fetch + lightweight HTML→text.
 * No paid APIs. Companion to web_search.
 */

import type { AgentTool } from "@porcupineai/agent-core";
import { Text } from "@porcupineai/tui";
import { type Static, Type } from "typebox";
import { theme } from "../../modes/interactive/theme/theme.ts";
import type { ToolDefinition } from "../extensions/types.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

const webExtractSchema = Type.Object({
	url: Type.String({ description: "HTTP(S) URL to fetch" }),
	maxChars: Type.Optional(Type.Number({ description: "Max characters of extracted text (default 12000)" })),
});

export type WebExtractToolInput = Static<typeof webExtractSchema>;

export interface WebExtractToolDetails {
	url: string;
	status: number;
	contentType?: string;
	truncated: boolean;
}

function decodeEntities(s: string): string {
	return s
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, " ");
}

function htmlToText(html: string): string {
	let s = html;
	// drop scripts/styles
	s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
	s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
	s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
	// block breaks
	s = s.replace(/<\/(p|div|h[1-6]|li|tr|section|article|br)[^>]*>/gi, "\n");
	s = s.replace(/<br\s*\/?>/gi, "\n");
	s = s.replace(/<[^>]+>/g, " ");
	s = decodeEntities(s);
	s = s
		.split("\n")
		.map((line) => line.replace(/[ \t]+/g, " ").trim())
		.filter(Boolean)
		.join("\n");
	return s.trim();
}

export async function extractUrl(
	url: string,
	maxChars = 12_000,
): Promise<{ text: string; details: WebExtractToolDetails }> {
	const u = url.trim();
	if (!/^https?:\/\//i.test(u)) {
		throw new Error("url must start with http:// or https://");
	}
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 20_000);
	try {
		const res = await fetch(u, {
			signal: controller.signal,
			headers: {
				"User-Agent": "Porcupine/0.83 (+free-web-extract)",
				Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
			},
			redirect: "follow",
		});
		const contentType = res.headers.get("content-type") || undefined;
		const raw = await res.text();
		let text: string;
		if (contentType?.includes("html") || /<html[\s>]/i.test(raw.slice(0, 500))) {
			text = htmlToText(raw);
		} else {
			text = raw;
		}
		const limit = Number.isFinite(maxChars) ? Math.max(500, Math.min(100_000, Math.floor(maxChars))) : 12_000;
		const truncated = text.length > limit;
		if (truncated) text = `${text.slice(0, limit)}\n\n[truncated to ${limit} chars]`;
		return {
			text: text || "(empty page)",
			details: {
				url: res.url || u,
				status: res.status,
				contentType,
				truncated,
			},
		};
	} finally {
		clearTimeout(timer);
	}
}

export function createWebExtractToolDefinition(): ToolDefinition<
	typeof webExtractSchema,
	WebExtractToolDetails | undefined
> {
	return {
		name: "web_extract",
		label: "web_extract",
		description:
			"Fetch a public URL and return cleaned text (HTML stripped). Free, no API key. Use after web_search when you need page content.",
		promptSnippet: "Fetch URL → plain text (free)",
		promptGuidelines: [
			"Use web_extract on concrete URLs from search or the user. Prefer web_search first when looking something up.",
		],
		parameters: webExtractSchema,
		async execute(_toolCallId, { url, maxChars }) {
			const result = await extractUrl(url, maxChars);
			return {
				content: [{ type: "text", text: result.text }],
				details: result.details,
			};
		},
		renderCall(args) {
			const url = String(args?.url ?? "...");
			return new Text(`${theme.fg("toolTitle", theme.bold("web_extract"))} ${theme.fg("toolOutput", url)}`, 0, 0);
		},
		renderResult(result, options) {
			const text = (result.content ?? [])
				.map((c) => (c.type === "text" ? c.text : ""))
				.join("")
				.trim();
			const preview = options.expanded ? text : text.split("\n").slice(0, 12).join("\n");
			return new Text(`\n${theme.fg("toolOutput", preview || "(empty)")}`, 0, 0);
		},
	};
}

export function createWebExtractTool(): AgentTool<typeof webExtractSchema> {
	return wrapToolDefinition(createWebExtractToolDefinition());
}
