/**
 * Document -> Skill / Tool extraction.
 *
 * Distills a source document (md/txt/pdf) into a reusable SKILL.md body
 * (Procedure / When to Use / Pitfalls) or, for command-oriented runbooks, a
 * callable distilled Tool persisted to user-tools.json.
 */

import { join } from "node:path";
import type { SkillKind } from "./skill-writer.ts";
import { EXTRACT_TEXT_CAP, extractDocumentText, writeSkill } from "./skill-writer.ts";
import type { UserToolRecord } from "./user-tools.ts";
import { shellQuote, writeUserTool } from "./user-tools.ts";

export interface ExtractOptions {
	path: string;
	stack: string;
	name: string;
	description?: string;
	force?: boolean;
	/** "skill" | "tool"; auto-detected when omitted. */
	kind?: SkillKind;
}

export interface ExtractResult {
	kind: SkillKind;
	/** Skill: written SKILL.md path. Tool: written user-tools.json path. */
	path: string;
	name: string;
	stack: string;
	description: string;
}

const COMMAND_HINTS =
	/\b(run|execute|install|npm |npx |pip |brew |git |curl |sh |bash |command|terminal|step [0-9]|usage)\b/i;

/**
 * Heuristic: does a distilled document look like a runbook/command-oriented
 * procedure? Used to default `kind` when not specified.
 */
export function detectKindFromText(description: string, text: string): SkillKind {
	const haystack = `${description}\n${text}`;
	return COMMAND_HINTS.test(haystack) ? "tool" : "skill";
}

/** Derive a description from the first non-empty, non-heading line of a document. */
export function deriveDescriptionFromText(text: string): string {
	for (const line of text.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("---")) continue;
		const clean = trimmed.replace(/[*_`]/g, "").trim();
		if (clean) return clean.slice(0, 200);
	}
	return "procedure distilled from the source document";
}

/**
 * Distill the document body into Markdown with When to Use / Procedure /
 * Pitfalls sections, mirroring the canonical SKILL.md shape.
 */
export function distillToSkillBody(text: string): string {
	const lines = text.split(/\r?\n/);
	const title = firstTitle(lines) ?? "Procedure";
	const body = deheading(lines).filter((l) => l.trim().length > 0);

	const procedure = numberedSteps(body);
	const when = deriveWhen(body);
	const pitfalls = derivePitfalls(body);

	const parts: string[] = [`# ${title}\n`];
	if (when.length) parts.push(`## When to Use\n\n${when}\n`);
	if (procedure.length) {
		parts.push(`## Procedure\n\n${procedure}\n`);
	} else {
		parts.push(`## Procedure\n\n1. Read the source document and identify the concrete steps it prescribes.\n`);
	}
	if (pitfalls.length) parts.push(`## Pitfalls\n\n${pitfalls}\n`);

	return parts.join("\n");
}

function firstTitle(lines: string[]): string | undefined {
	for (const line of lines) {
		const m = /^#\s+(.+)/.exec(line.trim());
		if (m) return m[1]!.replace(/[*_`]/g, "").trim();
	}
	return undefined;
}

/** Drop markdown headings but keep bullet lines that carry content. */
function deheading(lines: string[]): string[] {
	return lines.filter((line) => {
		const t = line.trim();
		if (/^#{1,6}\s/.test(t)) return false;
		if (/^---+\s*$/.test(t)) return false;
		return true;
	});
}

function numberedSteps(body: string[]): string {
	const candidates = body.filter((l) => {
		const t = l.trim();
		// Prefer lines that read like imperative instructions (bullets or numeric).
		return /^[-*]\s+/.test(t) || /^\d+\.?\s/.test(t);
	});
	const steps = candidates.map((l) => cleanBullet(l)).filter((s) => s.length > 0);
	if (steps.length === 0) {
		return "1. Review the source material and capture the key actionable steps.\n2. Apply the steps in order, verifying each result before continuing.";
	}
	// Limit to a sane number of steps so the skill stays reusable, not a dump.
	return steps.slice(0, 12).join("\n");
}

function cleanBullet(line: string): string {
	let t = line.trim();
	t = t.replace(/^[-*]\s+/, "").replace(/^#+\s*/, "");
	return t.replace(/[*_`]/g, "");
}

function deriveWhen(body: string[]): string {
	const intro = body.filter((l) => !/^[-*]\s/.test(l.trim())).join(" ");
	const any =
		(["when to", "use when", "applies when", "for:"].some((k) => intro.toLowerCase().includes(k))
			? intro
			: undefined) ??
		"Use this procedure whenever the task matches the steps below and the source material applies.";
	return `- ${cleanBullet(any).slice(0, 300)}`;
}

function derivePitfalls(body: string[]): string {
	const steps = body.filter((l) => /^[-*]\s/.test(l.trim())).length;
	const warnings = body.filter((l) => /warn|caution|careful|must not|do not|avoid|pitfall|don't/i.test(l.trim()));
	const items = warnings.map((l) => `- ${cleanBullet(l).slice(0, 200)}`);
	if (items.length === 0 && steps > 0) {
		return "- Verify each step's output before proceeding to the next.\n- Do not skip prerequisite checks or validation the source document specifies.";
	}
	if (items.length === 0) {
		return "- Verify each step's output before proceeding to the next.";
	}
	return items.slice(0, 8).join("\n");
}

/**
 * Distill a command-oriented document into a callable tool record.
 * The captured command template is best-effort; when none is found we fall back
 * to a passthrough `cat`/echo so the tool is still callable with a captured arg.
 */
export function distillToToolRecord(input: {
	path: string;
	name: string;
	description: string;
	stack: string;
	text: string;
}): UserToolRecord {
	const lines = input.text.split(/\r?\n/);
	const commands = lines
		.map((l) => {
			const m = /^\s*(?:```)?\s*(?:[->$]\s+)?([a-z0-9_./-]+(?:\s+.*)?)$/i.exec(l.trim().replace(/`/g, ""));
			return m ? m[1]!.trim() : undefined;
		})
		.filter((c): c is string => Boolean(c) && typeof c === "string" && /\s/.test(c))
		.filter((c) => !/^def |^import |^const |^let \b/i.test(c));
	const command =
		commands.at(0) ?? `echo ${shellQuote(input.name)} > /dev/null; echo ${shellQuote(`Run: ${input.description}`)}`;

	const record: UserToolRecord = {
		name: input.name,
		description: input.description,
		parameters: {}, // arguments are captured from the document's steps when extractable
		command,
	};
	return record;
}

/**
 * Extract and write a distilled Skill (SKILL.md) or Tool (user-tools.json).
 */
export async function extractSkillFromDocument(agentDir: string, opts: ExtractOptions): Promise<ExtractResult> {
	const text0 = await extractDocumentText(opts.path);
	// Truncate to a sane cap to avoid context blowout.
	const text = text0.length > EXTRACT_TEXT_CAP ? text0.slice(0, EXTRACT_TEXT_CAP) : text0;
	const description = opts.description?.trim() || deriveDescriptionFromText(text);
	if (!description) {
		throw new Error("Unable to derive a description from the document; pass --desc explicitly.");
	}

	const kind = opts.kind ?? detectKindFromText(description, text);

	if (kind === "tool") {
		const record = distillToToolRecord({
			path: opts.path,
			name: opts.name,
			description,
			stack: opts.stack,
			text,
		});
		writeUserTool(agentDir, record, { force: opts.force });
		return {
			kind: "tool",
			path: join(agentDir, "user-tools.json"),
			name: opts.name,
			stack: opts.stack,
			description,
		};
	}

	const body = distillToSkillBody(text);
	const result = writeSkill(
		agentDir,
		{
			stack: opts.stack,
			name: opts.name,
			description,
			content: body,
		},
		{ force: opts.force },
	);
	return { kind: "skill", ...result, description };
}

export { writeSkill };
