/**
 * Agent tools for skill extraction and skill crafting.
 *
 * - `extract_skill`: distill a local document into a SKILL.md (or user-tools.json tool).
 * - `craft_skill`: deep-research a topic, then write a SKILL.md (or user-tools tool).
 */

import type { AgentTool } from "@porcupineai/agent-core";
import { Text } from "@porcupineai/tui";
import { type Static, Type } from "typebox";
import { getAgentDir } from "../../config.ts";
import { theme } from "../../modes/interactive/theme/theme.ts";
import type { SourceNote } from "../../porcupine/skill-craft.ts";
import { type CraftOptions, craftSkill as craftSkillImpl } from "../../porcupine/skill-craft.ts";
import { type ExtractOptions, extractSkillFromDocument } from "../../porcupine/skill-extract.ts";
import type { SkillKind } from "../../porcupine/skill-writer.ts";
import type { ToolDefinition } from "../extensions/types.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

const KIND = Type.Union([Type.Literal("skill"), Type.Literal("tool")], {
	description: '"skill" writes a SKILL.md into agent-home; "tool" writes a callable shell tool to user-tools.json',
});

const extractSchema = Type.Object({
	path: Type.String({ description: "Path to the source document (.md/.txt/.pdf)" }),
	stack: Type.String({ description: "Stack id (lowercase a-z, 0-9, hyphens) the skill lives under" }),
	name: Type.String({ description: "Skill/tool name (lowercase a-z, 0-9, hyphens)" }),
	description: Type.Optional(
		Type.String({ description: "Optional description; derived from the document when omitted" }),
	),
	kind: Type.Optional(KIND),
	force: Type.Optional(Type.Boolean({ description: "Overwrite an existing skill/tool with the same name" })),
});
export type ExtractSkillToolInput = Static<typeof extractSchema>;

const craftSchema = Type.Object({
	name: Type.String({ description: "Skill/tool name (lowercase a-z, 0-9, hyphens)" }),
	description: Type.String({ description: "Description of the skill/tool's purpose" }),
	stack: Type.Optional(Type.String({ description: "Stack id; defaults to meta" })),
	researchHint: Type.Optional(
		Type.String({ description: "Optional research focus or the exact command to capture for a tool" }),
	),
	kind: Type.Optional(KIND),
	force: Type.Optional(Type.Boolean({ description: "Overwrite an existing skill/tool with the same name" })),
});
export type CraftSkillToolInput = Static<typeof craftSchema>;

export interface SkillToolDetails {
	kind: SkillKind;
	path: string;
	name: string;
	stack: string;
	description: string;
	sources?: SourceNote[];
}

export interface SkillToolOptions {
	agentDir?: string;
}

function statusText(details: SkillToolDetails): string {
	return `${details.kind} "${details.name}" written to ${details.path}`;
}

export function createExtractSkillToolDefinition(
	options?: SkillToolOptions,
): ToolDefinition<typeof extractSchema, SkillToolDetails> {
	const agentDir = options?.agentDir ?? getAgentDir();
	return {
		name: "extract_skill",
		label: "extract_skill",
		description:
			"Distill a local document (.md/.txt/.pdf) into a reusable SKILL.md in the agent-home skills dir (kind=skill) or a callable shell tool (kind=tool). Provide path, stack, and name. Use when a runbook, paper, or article should become a reusable capability the agent can auto-load.",
		promptSnippet: "Extract a reusable skill/tool from a document",
		promptGuidelines: [
			"Use extract_skill to turn a local runbook/paper/article into a discoverable SKILL.md or a callable shell tool.",
			"Pick a stack id (web, shell, coding, meta, vcs, docs, data, sci, etc.) and a lowercase-hyphen name.",
			"kind=tool only for command/runbook-oriented documents; otherwise kind=skill (the default).",
		],
		parameters: extractSchema,
		async execute(_toolCallId, args) {
			const opts: ExtractOptions = {
				path: args.path,
				stack: args.stack,
				name: args.name,
				description: args.description,
				kind: args.kind,
				force: args.force,
			};
			const result = await extractSkillFromDocument(agentDir, opts);
			return {
				content: [{ type: "text", text: statusText(result) }],
				details: result,
			};
		},
		renderCall(args) {
			return new Text(
				`${theme.fg("toolTitle", theme.bold("extract_skill"))} ${theme.fg("toolOutput", String(args?.name ?? "?"))}`,
				0,
				0,
			);
		},
		renderResult(result, options) {
			const text = (result.content ?? [])
				.map((c) => (c.type === "text" ? c.text : ""))
				.join("")
				.trim();
			return new Text(`\n${theme.fg("toolOutput", options.expanded ? text : text.split("\n")[0])}`, 0, 0);
		},
	};
}

export function createExtractSkillTool(options?: SkillToolOptions): AgentTool<typeof extractSchema> {
	return wrapToolDefinition(createExtractSkillToolDefinition(options));
}

export function createCraftSkillToolDefinition(
	options?: SkillToolOptions,
): ToolDefinition<typeof craftSchema, SkillToolDetails> {
	const agentDir = options?.agentDir ?? getAgentDir();
	return {
		name: "craft_skill",
		label: "craft_skill",
		description:
			"Deep-research a topic with free web search, then craft a discoverable SKILL.md (kind=skill) or a callable shell tool (kind=tool) in the agent-home. Provide name and description; pass researchHint to focus the search or to capture the exact command for a tool.",
		promptSnippet: "Research then craft a skill/tool",
		promptGuidelines: [
			"Use craft_skill to build a discovered, reusable capability from live research rather than from a single document.",
			"Pass researchHint with a focused query, or pre-collect research notes upstream and describe the intent.",
			"kind=tool produces a callable shell tool with a captured command; kind=skill writes a SKILL.md procedure.",
		],
		parameters: craftSchema,
		async execute(_toolCallId, args) {
			const opts: CraftOptions = {
				name: args.name,
				description: args.description,
				stack: args.stack,
				researchHint: args.researchHint,
				kind: args.kind,
				force: args.force,
			};
			const result = await craftSkillImpl(agentDir, opts);
			return {
				content: [{ type: "text", text: statusText(result) }],
				details: result,
			};
		},
		renderCall(args) {
			return new Text(
				`${theme.fg("toolTitle", theme.bold("craft_skill"))} ${theme.fg("toolOutput", String(args?.name ?? "?"))}`,
				0,
				0,
			);
		},
		renderResult(result, options) {
			const text = (result.content ?? [])
				.map((c) => (c.type === "text" ? c.text : ""))
				.join("")
				.trim();
			return new Text(`\n${theme.fg("toolOutput", options.expanded ? text : text.split("\n")[0])}`, 0, 0);
		},
	};
}

export function createCraftSkillTool(options?: SkillToolOptions): AgentTool<typeof craftSchema> {
	return wrapToolDefinition(createCraftSkillToolDefinition(options));
}
