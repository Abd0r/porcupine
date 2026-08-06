/**
 * Durable literature & references tool for scientific research.
 *
 * Records papers the agent finds during research (title, authors, year, venue,
 * DOI/URL, status, evidence grade, notes) in a local durable store under the
 * agent home. Deduplicates by DOI; refuses content that looks like secrets.
 * Read+write — the store is agent-owned research state, not project code.
 */

import type { AgentTool } from "@porcupineai/agent-core";
import { Text } from "@porcupineai/tui";
import { type Static, Type } from "typebox";
import { getAgentDir } from "../../config.ts";
import { theme } from "../../modes/interactive/theme/theme.ts";
import { type LiteratureStatus, LiteratureStore } from "../../porcupine/literature-store.ts";
import type { ToolDefinition } from "../extensions/types.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

const STATUSES: LiteratureStatus[] = ["to-read", "reading", "reviewed", "incorporated"];
const GRADES = ["A", "B", "C", "D"] as const;

const literatureSchema = Type.Object({
	action: Type.Union(
		[
			Type.Literal("add"),
			Type.Literal("list"),
			Type.Literal("search"),
			Type.Literal("show"),
			Type.Literal("update"),
			Type.Literal("remove"),
		],
		{ description: "add | list | search | show | update | remove" },
	),
	referenceId: Type.Optional(Type.String({ description: "Reference id (show/update/remove)" })),
	title: Type.Optional(Type.String({ description: "Paper or report title (add/update)" })),
	authors: Type.Optional(Type.Array(Type.String(), { description: "Author names (add/update)" })),
	year: Type.Optional(Type.Number({ description: "Publication year (add/update)" })),
	venue: Type.Optional(Type.String({ description: "Journal, conference, arXiv, or repository (add/update)" })),
	url: Type.Optional(Type.String({ description: "Resolvable URL (add/update)" })),
	doi: Type.Optional(Type.String({ description: "DOI, with or without https://doi.org/ prefix (add/update)" })),
	status: Type.Optional(
		Type.Union(
			[Type.Literal("to-read"), Type.Literal("reading"), Type.Literal("reviewed"), Type.Literal("incorporated")],
			{ description: "to-read | reading | reviewed | incorporated" },
		),
	),
	grade: Type.Optional(
		Type.Union([Type.Literal("A"), Type.Literal("B"), Type.Literal("C"), Type.Literal("D")], {
			description: "Evidence grade: A peer-reviewed/replicated, B single study, C preprint, D unverified",
		}),
	),
	notes: Type.Optional(Type.String({ description: "One-line takeaway or finding (add/update)" })),
	evidence: Type.Optional(Type.String({ description: "What the source actually shows (add/update)" })),
	query: Type.Optional(Type.String({ description: "Search across title/authors/venue/doi/notes (action=search)" })),
});

export type LiteratureToolInput = Static<typeof literatureSchema>;

export interface LiteratureToolDetails {
	action: string;
	referenceId?: string;
	added?: boolean;
	removed?: boolean;
	count?: number;
}

export interface LiteratureToolOptions {
	/** Agent home (~/.porcupine/agent). Defaults to getAgentDir(). */
	agentDir?: string;
	/** Store override (tests). */
	store?: LiteratureStore;
}

function formatReference(entry: NonNullable<ReturnType<LiteratureStore["get"]>>): string {
	const lines = [
		`${entry.title}  (${entry.id})`,
		`  status: ${entry.status}${entry.grade ? `  grade: ${entry.grade}` : ""}`,
	];
	if (entry.authors.length > 0) lines.push(`  authors: ${entry.authors.join(", ")}`);
	const meta: string[] = [];
	if (entry.year) meta.push(String(entry.year));
	if (entry.venue) meta.push(entry.venue);
	if (meta.length > 0) lines.push(`  ${meta.join(" · ")}`);
	if (entry.doi) lines.push(`  doi: ${entry.doi}`);
	if (entry.url) lines.push(`  url: ${entry.url}`);
	if (entry.notes) lines.push(`  notes: ${entry.notes}`);
	if (entry.evidence) lines.push(`  evidence: ${entry.evidence}`);
	lines.push(`  updated: ${entry.updatedAt}`);
	return lines.join("\n");
}

function formatList(store: LiteratureStore): string {
	const entries = store.list();
	if (entries.length === 0) {
		return "No references yet. Record one with action=add (title + doi or url).";
	}
	const counts = STATUSES.map(
		(status) => `${status}:${entries.filter((entry) => entry.status === status).length}`,
	).join("  ");
	return `${counts}\n\n${entries.map((entry) => `• ${entry.id}  [${entry.status}]  ${entry.title}`).join("\n")}`;
}

function validateGrade(grade: unknown): grade is "A" | "B" | "C" | "D" {
	return typeof grade === "string" && (GRADES as readonly string[]).includes(grade);
}

export function createLiteratureToolDefinition(
	options?: LiteratureToolOptions,
): ToolDefinition<typeof literatureSchema, LiteratureToolDetails | undefined> {
	const agentDir = options?.agentDir ?? getAgentDir();
	let store: LiteratureStore | undefined;

	const getStore = (): LiteratureStore => {
		store ??= options?.store ?? new LiteratureStore(agentDir);
		return store;
	};

	return {
		name: "literature",
		label: "literature",
		description:
			"Durable local literature store for research. action=add records a paper or report (title + doi or url; optional authors, year, venue, status, grade A–D, notes, evidence) and deduplicates by DOI; action=list shows all references grouped by status; action=search finds references across title/authors/venue/doi/notes; action=show prints full details; action=update changes fields (including status: to-read|reading|reviewed|incorporated); action=remove deletes a reference. The store lives in the agent home, so references survive across projects and sessions.",
		promptSnippet: "Durable literature store (add/list/search/update papers)",
		promptGuidelines: [
			"During research, record every paper you actually read with action=add; search before adding to avoid duplicates.",
			"Use grade to mark evidence quality (A peer-reviewed/replicated, B single study, C preprint, D unverified) and status to track progress.",
			"Store findings and citation keys in the literature store, not in memory (memory is for durable preferences).",
		],
		parameters: literatureSchema,
		executionMode: "sequential",
		async execute(_toolCallId, input) {
			const details: LiteratureToolDetails = { action: input.action };
			const s = getStore();

			switch (input.action) {
				case "add": {
					const result = s.add({
						title: input.title ?? "",
						authors: input.authors,
						year: input.year,
						venue: input.venue,
						url: input.url,
						doi: input.doi,
						status: input.status,
						grade: validateGrade(input.grade) ? input.grade : undefined,
						notes: input.notes,
						evidence: input.evidence,
					});
					if (!result.ok) return { content: [{ type: "text" as const, text: result.error }], details };
					details.referenceId = result.reference.id;
					details.added = true;
					return {
						content: [
							{ type: "text" as const, text: `Recorded ${result.reference.id} (${result.reference.title})` },
						],
						details,
					};
				}
				case "list": {
					const text = formatList(s);
					details.count = s.list().length;
					return { content: [{ type: "text" as const, text }], details };
				}
				case "search": {
					const query = input.query?.trim();
					if (!query) return { content: [{ type: "text" as const, text: "search requires a query" }], details };
					const results = s.search(query);
					details.count = results.length;
					const text =
						results.length === 0
							? `No references match: ${query}`
							: results.map((entry) => `• ${entry.id}  [${entry.status}]  ${entry.title}`).join("\n");
					return { content: [{ type: "text" as const, text }], details };
				}
				case "show": {
					const id = input.referenceId?.trim();
					if (!id) return { content: [{ type: "text" as const, text: "show requires a referenceId" }], details };
					const entry = s.get(id);
					details.referenceId = id;
					if (!entry) return { content: [{ type: "text" as const, text: `Reference not found: ${id}` }], details };
					return { content: [{ type: "text" as const, text: formatReference(entry) }], details };
				}
				case "update": {
					const id = input.referenceId?.trim();
					if (!id) return { content: [{ type: "text" as const, text: "update requires a referenceId" }], details };
					details.referenceId = id;
					const result = s.update(id, {
						title: input.title,
						authors: input.authors,
						year: input.year,
						venue: input.venue,
						url: input.url,
						doi: input.doi,
						status: input.status,
						grade: input.grade !== undefined ? (validateGrade(input.grade) ? input.grade : undefined) : undefined,
						notes: input.notes,
						evidence: input.evidence,
					});
					if (!result.ok) return { content: [{ type: "text" as const, text: result.error }], details };
					return {
						content: [
							{
								type: "text" as const,
								text: `Updated ${id}: ${result.reference.title} [${result.reference.status}]`,
							},
						],
						details,
					};
				}
				case "remove": {
					const id = input.referenceId?.trim();
					if (!id) return { content: [{ type: "text" as const, text: "remove requires a referenceId" }], details };
					const result = s.remove(id);
					if (!result.ok) return { content: [{ type: "text" as const, text: result.error }], details };
					details.referenceId = id;
					details.removed = true;
					return { content: [{ type: "text" as const, text: `Removed ${id}` }], details };
				}
			}
		},
		renderCall(args) {
			return new Text(
				`${theme.fg("toolTitle", theme.bold("literature"))} ${args.action}${args.title ? ` ${args.title}` : ""}`,
				0,
				0,
			);
		},
		renderResult(toolResult, _options, resultTheme) {
			const details = toolResult.details;
			const label = details?.added
				? `Recorded ${details.referenceId ?? ""}`
				: details?.removed
					? `Removed ${details.referenceId ?? ""}`
					: `${details?.action ?? "literature"}${details?.count !== undefined ? ` (${details.count})` : ""}`;
			return new Text(resultTheme.fg("accent", label), 0, 0);
		},
	};
}

export function createLiteratureTool(options?: LiteratureToolOptions): AgentTool {
	return wrapToolDefinition(createLiteratureToolDefinition(options));
}
