/**
 * Deep-research skill/tool crafting.
 *
 * Performs web research (free cascade + page extraction) before writing a
 * SKILL.md (kind:"skill") or a user-tools.json record (kind:"tool"). Accepts
 * optional pre-gathered notes so a caller can pass research without re-searching.
 */

import { extractUrl } from "../core/tools/web-extract.ts";
import { runFreeWebSearch, type WebSearchHit } from "../core/tools/web-search.ts";
import type { SkillKind } from "./skill-writer.ts";
import { skillFrontmatter, writeSkill } from "./skill-writer.ts";
import { shellQuote, type UserToolRecord, writeUserTool } from "./user-tools.ts";

export interface SourceNote {
	title: string;
	url: string;
	keyPoints: string;
}

export interface CraftOptions {
	name: string;
	stack?: string;
	description: string;
	/** Optional pre-gathered research; when empty, deep-research runs automatically. */
	researchHint?: string;
	/** Pre-gathered notes to skip web research. */
	notes?: SourceNote[];
	/** "skill" | "tool"; default "skill". */
	kind?: SkillKind;
	force?: boolean;
}

export interface CraftResult {
	kind: SkillKind;
	path: string;
	name: string;
	stack: string;
	description: string;
	sources: SourceNote[];
}

const DEFAULT_STACK = "meta";

function trimStack(stack: string | undefined): string {
	return stack && /^[a-z0-9-]+$/.test(stack) ? stack : DEFAULT_STACK;
}

/** Derive search queries from the skill name + description. */
export function buildSearchQueries(name: string, description: string): string[] {
	const base = `${name} ${description}`;
	return [base.trim().slice(0, 200), name.trim().slice(0, 120)];
}

/**
 * Run deep research: search, extract top hits, and return source notes.
 * A single failed cluster never aborts the whole craft; we degrade gracefully.
 */
export async function deepResearch(name: string, description: string, researchHint?: string): Promise<SourceNote[]> {
	const queries = [...buildSearchQueries(name, description)];
	if (researchHint?.trim()) {
		queries.unshift(researchHint.trim().slice(0, 200));
	}

	const notes: SourceNote[] = [];
	for (const query of queries) {
		if (notes.length >= 6) break;
		let hits: WebSearchHit[];
		try {
			const result = await runFreeWebSearch(query, 4);
			hits = result.hits;
		} catch {
			continue; // try next query
		}
		for (const hit of hits.slice(0, 3)) {
			if (notes.length >= 6) break;
			let text = "";
			try {
				text = (await extractUrl(hit.url, 6000)).text;
			} catch {
				if (hit.snippet) text = hit.snippet;
			}
			notes.push({
				title: hit.title || hit.url,
				url: hit.url,
				keyPoints:
					text
						.split(/\r?\n/)
						.map((l) => l.replace(/[ \t]+/g, " ").trim())
						.filter((l) => l.length > 0)
						.slice(0, 6)
						.join("\n")
						.slice(0, 700) ||
					hit.snippet ||
					"Extracted from the source page.",
			});
		}
	}
	return notes;
}

/** Build a Sources section for the SKILL.md body from source notes. */
function sourcesSection(notes: SourceNote[]): string {
	if (notes.length === 0) return "";
	const lines = notes.map((n) => `- **${n.title}** - ${n.url}`);
	return `## Sources\n\n${lines.join("\n")}\n`;
}

/** Compose a SKILL.md body from researched notes following the canonical shape. */
export function composeSkillBody(input: {
	name: string;
	description: string;
	stack: string;
	notes: SourceNote[];
	sources: SourceNote[];
}): string {
	const title = input.name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
	const notesText = input.notes.length
		? input.notes.map((n) => `- ${n.title}: ${n.keyPoints.split("\n")[0] ?? ""}`).join("\n")
		: "- Capture the concrete steps from the primary sources referenced below.";
	const sources = sourcesSection(input.sources.length ? input.sources : input.notes);
	return `${[
		`# ${title}`,
		"",
		"Researched, skill-crafted procedure for the task in the frontmatter description.",
		"",
		"## When to Use",
		"",
		`- Use this skill when: ${input.description}.`,
		"- NOT for: chit-chat, or tasks fully answerable from the repo (grep first).",
		"",
		"## Procedure",
		"",
		notesText,
		"",
		"1. Read the referenced source(s) that best match the current task.",
		"2. Extract the concrete steps and apply them in order, verifying each result.",
		"",
		"## Pitfalls",
		"",
		"- Never invent facts, URLs, or citations. Cite only sources you actually read.",
		"- A search snippet is not proof - extract the page to confirm wording.",
		"- Corroborate load-bearing claims with a second independent source.",
		"- Mark guesses or unverified assumptions explicitly rather than asserting them.",
		"",
		...sources.split("\n"),
	]
		.join("\n")
		.trimEnd()}\n`;
}

/**
 * Craft a distilled Tool (kind:"tool") from research notes. The command is a
 * best-effort capture; callers should pass researchHint with a concrete command
 * to make the tool genuinely callable.
 */
export function composeToolBody(input: { name: string; description: string }): string {
	return `# ${input.name}\n\nA callable distilled tool for: ${input.description}.`;
}

/**
 * Craft and persist a skill (SKILL.md) or tool (user-tools.json) after research.
 */
export async function craftSkill(agentDir: string, opts: CraftOptions): Promise<CraftResult> {
	const stack = trimStack(opts.stack);
	const notes = opts.notes?.length ? opts.notes : await deepResearch(opts.name, opts.description, opts.researchHint);
	const kind = opts.kind ?? "skill";

	if (kind === "tool") {
		const record: UserToolRecord = {
			name: opts.name,
			description: opts.description,
			parameters: {},
			command: opts.researchHint?.trim() || `echo ${shellQuote(`${opts.name} tool - see sources`)}`,
		};
		writeUserTool(agentDir, record, { force: opts.force });
		return {
			kind: "tool",
			path: `${agentDir}/user-tools.json`,
			name: opts.name,
			stack,
			description: opts.description,
			sources: notes,
		};
	}

	const sources = notes.map((n) => ({ title: n.title, url: n.url, keyPoints: n.keyPoints }));
	const body = composeSkillBody({
		name: opts.name,
		description: opts.description,
		stack,
		notes,
		sources,
	});
	const result = writeSkill(
		agentDir,
		{
			stack,
			name: opts.name,
			description: opts.description,
			content: body,
		},
		{ force: opts.force },
	);
	return { kind: "skill", ...result, description: opts.description, sources };
}

// Re-exported for callers that only need the frontmatter helper after writing.
export { skillFrontmatter };
