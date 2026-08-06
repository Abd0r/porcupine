/**
 * MCP v2 — resources + prompts mapping (pure).
 *
 * Resources (`resources/list` + `resources/read`) surface into context/docs;
 * prompts (`prompts/list` + `prompts/get`) surface as slash commands
 * (Claude-Code-style). This module keeps the mapping pure/testable and exposes
 * the shapes the manager consumes. Slash-command *registration* lives in the
 * interactive layer (main-agent owned); here we provide the provider that the
 * interactive command-registration path can build /mcp prompts from.
 */

import { sanitizeToolDescription } from "./backend.ts";

// ============================================================================
// Resources
// ============================================================================

export interface McpResourceInfo {
	uri: string;
	name: string;
	description?: string;
	mimeType?: string;
}

export interface McpResourceContent {
	uri: string;
	mimeType?: string;
	/** Text content (or a placeholder for binary blobs). */
	text: string;
}

/**
 * Strip an MCP resource listing to a small, stable summary shape used for
 * context/docs injection. Untrusted description is clipped + advisory-tagged.
 */
export function mapResourceInfo(
	resource: { uri: string; name: string; description?: string; mimeType?: string } | undefined,
): McpResourceInfo | undefined {
	if (!resource || typeof resource.uri !== "string") return undefined;
	return {
		uri: resource.uri,
		name: resource.name ?? resource.uri,
		description: sanitizeToolDescription(resource.description),
		mimeType: resource.mimeType,
	};
}

/**
 * Flatten a `resources/read` result's `contents[]` into plain text lines,
 * mirroring how any doc source joins into the agent context.
 * Binary blobs are reduced to a one-line placeholder (cannot be contextually
 * injected).
 */
export function mapResourceReadText(
	contents: ReadonlyArray<{ uri?: string; text?: string; blob?: string; mimeType?: string }> | undefined,
): string {
	if (!contents || contents.length === 0) return "";
	const parts: string[] = [];
	for (const block of contents) {
		if (typeof block.text === "string") {
			parts.push(block.text);
		} else if (typeof block.blob === "string") {
			parts.push(`[binary resource ${block.uri ?? ""} (${block.mimeType ?? "application/octet-stream"})]`);
		} else {
			parts.push(`[resource ${block.uri ?? ""}]`);
		}
	}
	return parts.join("\n");
}

/** Build a compact one-line-per-resource doc string for context injection. */
export function formatResourceContext(resources: McpResourceInfo[]): string {
	if (resources.length === 0) return "";
	const header = "MCP resources:";
	const lines = resources.map((r) => `  - ${r.uri} (${r.name})`);
	return [header, ...lines].join("\n");
}

// ============================================================================
// Prompts → slash commands
// ============================================================================

export interface McpPromptInfo {
	name: string;
	description?: string;
	/** Optional named template arguments. */
	arguments?: Array<{ name: string; description?: string; required?: boolean }>;
}

export interface McpPromptMessage {
	role: "user" | "assistant";
	content: { type: "text"; text: string };
}

export interface McpPromptResolution {
	name: string;
	description?: string;
	/** Fully resolved prompt messages for the given argument values. */
	messages: McpPromptMessage[];
}

/**
 * Describe a `prompts/get` result as a slash-command-shaped record.
 * The interactive command-registration path (main agent) uses this to build a
 * `/mcp:<serverKey>:<promptName>` prompt command that calls back into the
 * manager to resolve arguments.
 */
export function mapPromptInfo(prompt: McpPromptInfo | undefined): McpPromptInfo | undefined {
	if (!prompt || typeof prompt.name !== "string") return undefined;
	return {
		name: prompt.name,
		description: prompt.description,
		arguments: Array.isArray(prompt.arguments)
			? prompt.arguments.map((a) => ({
					name: a.name,
					description: a.description,
					required: a.required,
				}))
			: undefined,
	};
}

/**
 * Extract resolved prompt text from a `prompts/get` result (`messages[]`).
 * Used to fill a slash command's response before handing off to the prompt
 * template path. Non-text content blocks are dropped.
 */
export function mapPromptMessages(
	messages: ReadonlyArray<{ role?: string; content?: unknown }> | undefined,
): McpPromptMessage[] {
	if (!messages) return [];
	const out: McpPromptMessage[] = [];
	for (const m of messages) {
		const role = m.role === "assistant" ? "assistant" : "user";
		const text = extractPromptText(m.content);
		if (text) {
			out.push({ role, content: { type: "text", text } });
		}
	}
	return out;
}

function extractPromptText(content: unknown): string | undefined {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((block) =>
				block && typeof block === "object" && (block as { type?: string }).type === "text"
					? ((block as { text?: string }).text ?? "")
					: "",
			)
			.filter(Boolean)
			.join("\n");
	}
	if (content && typeof content === "object" && (content as { type?: string }).type === "text") {
		return (content as { text?: string }).text;
	}
	return undefined;
}

/**
 * Form a namespaced slash-command name for an MCP prompt, e.g.
 * `mcpp:<serverKey>:<promptName>`. Kept distinct from the `mcp/` tool namespace
 * to avoid ambiguity.
 */
export function promptSlashCommandName(serverKey: string, promptName: string): string {
	return `mcpp:${serverKey}:${promptName}`;
}
