import { basename } from "node:path";
import type { AgentTool } from "@porcupineai/agent-core";
import type { TextContent } from "@porcupineai/ai";
import { constants } from "fs";
import { access as fsAccess, readFile as fsReadFile, stat as fsStat } from "fs/promises";
import { type Static, Type } from "typebox";
import type { ToolDefinition } from "../extensions/types.ts";
import { resolveReadPathAsync } from "./path-utils.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

/** Maximum file size, in bytes, that `show_markdown` will render (200 KiB). */
export const SHOW_MARKDOWN_MAX_BYTES = 200 * 1024;

const showMarkdownSchema = Type.Object({
	path: Type.Optional(Type.String({ description: "Path to the markdown file to display" })),
	content: Type.Optional(Type.String({ description: "Raw markdown content to display" })),
	title: Type.Optional(
		Type.String({ description: "Title shown in the viewer title bar (defaults to the file name)" }),
	),
});

export type ShowMarkdownToolInput = Static<typeof showMarkdownSchema>;

export interface ShowMarkdownDetails {
	markdownViewer?: {
		title: string;
		content: string;
		path?: string;
	};
}

function resolveTitle(path: string | undefined, title: string | undefined): string {
	if (title?.trim()) {
		return title.trim();
	}
	return path ? basename(path) : "Markdown viewer";
}

async function loadContent(
	path: string | undefined,
	content: string | undefined,
	cwd: string,
): Promise<{ content: string; path?: string }> {
	if (content !== undefined) {
		return { content };
	}
	if (path === undefined || path === "") {
		throw new Error('Either "path" or "content" is required.');
	}

	const absolutePath = await resolveReadPathAsync(path, cwd);
	await fsAccess(absolutePath, constants.R_OK);
	const stat = await fsStat(absolutePath);
	if (stat.size > SHOW_MARKDOWN_MAX_BYTES) {
		throw new Error(
			`File is ${stat.size} bytes, exceeds the ${SHOW_MARKDOWN_MAX_BYTES / 1024}KB markdown viewer limit.`,
		);
	}
	const buffer = await fsReadFile(absolutePath);
	return { content: buffer.toString("utf-8"), path: absolutePath };
}

export function createShowMarkdownToolDefinition(
	cwd: string,
): ToolDefinition<typeof showMarkdownSchema, ShowMarkdownDetails> {
	return {
		name: "show_markdown",
		label: "show_markdown",
		description:
			'Display a markdown document (path or inline content) to the user as a full-screen rendered viewer. Provide either a "path" to a local .md file or raw "content". Use this to present plans, reports, or docs instead of dumping raw text into the chat.',
		promptSnippet: "Display a markdown document in the viewer",
		promptGuidelines: ["Use show_markdown to present plans, reports, or docs to the user in a readable viewer."],
		parameters: showMarkdownSchema,
		async execute(_toolCallId, params): Promise<{ content: TextContent[]; details: ShowMarkdownDetails }> {
			const { content, path } = await loadContent(params.path, params.content, cwd);
			const title = resolveTitle(params.path, params.title);
			return {
				content: [
					{
						type: "text",
						text: `Rendered "${title}" in the markdown viewer.`,
					},
				],
				details: {
					markdownViewer: { title, content, ...(path !== undefined ? { path } : {}) },
				},
			};
		},
	};
}

export function createShowMarkdownTool(cwd: string): AgentTool<typeof showMarkdownSchema, ShowMarkdownDetails> {
	return wrapToolDefinition(createShowMarkdownToolDefinition(cwd));
}
