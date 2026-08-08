/**
 * Shared writer for the skill-extraction and skill-crafting systems.
 *
 * Reads source documents (md/txt/pdf), validates stack/name identifiers, and
 * writes real SKILL.md files into the agent-home skills dir so they are
 * discoverable and auto-inject into context.
 *
 * A distilled output may be a **Skill** (agent-facing procedure) or a **Tool**
 * (callable, shell-backed). Tool records are persisted to
 * `<agentDir>/user-tools.json` (see skill-extract/skill-craft and user-tools.ts).
 */

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";

const STACK_ID_RE = /^[a-z0-9-]+$/;
const NAME_ID_RE = /^[a-z0-9-]+$/;

/** Maximum source document bytes kept for distillation (avoids context blowout). */
export const EXTRACT_TEXT_CAP = 60_000;

export type SkillKind = "skill" | "tool";

export interface SkillWriteInput {
	stack: string;
	name: string;
	description: string;
	content: string;
}

export interface SkillWriteResult {
	path: string;
	stack: string;
	name: string;
}

/** Produce the SKILL.md YAML frontmatter block. */
export function skillFrontmatter(stack: string, name: string, description: string): string {
	return ["---", `name: ${name}`, `description: ${description}`, `stack: ${stack}`, "---"].join("\n");
}

/** Validate a stack id; returns an error message or empty string when ok. */
export function validateStackId(stack: string): string {
	if (!stack || !STACK_ID_RE.test(stack)) {
		return "stack must be lowercase a-z, 0-9, hyphens only";
	}
	return "";
}

/** Validate a skill/tool name; returns an error message or empty string when ok. */
export function validateName(name: string): string {
	if (!name || !NAME_ID_RE.test(name)) {
		return "name must be lowercase a-z, 0-9, hyphens only";
	}
	if (name.startsWith("-") || name.endsWith("-") || name.includes("--")) {
		return "name must not start/end with a hyphen or contain consecutive hyphens";
	}
	return "";
}

/**
 * Read a document's text.
 * - `.md` / `.txt` read natively.
 * - `.pdf` runs `pdftotext <path> -` (requires pdftotext on PATH; raises a clean
 *   error when missing).
 * Throws a clean error for unsupported extensions.
 */
export async function extractDocumentText(path: string): Promise<string> {
	const ext = extname(path).toLowerCase();
	if (ext === ".md" || ext === ".txt") {
		return readFileSync(path, "utf-8");
	}
	if (ext === ".pdf") {
		const { stdout, err } = await runPdfToText(path);
		if (err) {
			const code = (err as NodeJS.ErrnoException)?.code;
			const message = err.message ?? String(err);
			if (code === "ENOENT") {
				throw new Error(
					"Cannot extract PDF text: pdftotext is not installed. Install poppler-utils (brew install poppler) or convert the document to markdown first.",
				);
			}
			throw new Error(`pdftotext failed: ${message}`);
		}
		const text = stdout ?? "";
		if (!text || text.trim() === "") {
			throw new Error("pdftotext returned no text (the PDF may be image-only or empty).");
		}
		return text;
	}
	throw new Error(`Unsupported document extension "${ext}". Supported: .md, .txt, .pdf`);
}

/** Run `pdftotext <path> -`; resolves with stdout, or err for failure handling. */
function runPdfToText(path: string): Promise<{ stdout?: string; err?: Error }> {
	return new Promise((resolve) => {
		execFile(
			"pdftotext",
			[path, "-"],
			{ encoding: "utf8", maxBuffer: 64 * 1024 * 1024 } as Parameters<typeof execFile>[2],
			(err, stdout) => {
				if (err) resolve({ err: err as Error });
				else resolve({ stdout: stdout as unknown as string });
			},
		);
	});
}

/**
 * Write a SKILL.md into `agentDir/skills/<stack>/<name>/SKILL.md` atomically.
 * Never clobbers an existing user skill without `force`.
 */
export function writeSkill(agentDir: string, input: SkillWriteInput, opts: { force?: boolean } = {}): SkillWriteResult {
	const stackError = validateStackId(input.stack);
	if (stackError) throw new Error(`Invalid stack: ${stackError}`);
	const nameError = validateName(input.name);
	if (nameError) throw new Error(`Invalid name: ${nameError}`);
	if (!input.description || input.description.trim() === "") {
		throw new Error("description is required and must be non-empty");
	}

	const target = join(agentDir, "skills", input.stack, input.name, "SKILL.md");
	try {
		readFileSync(target, "utf-8");
		// Existing file found.
		if (!opts.force) {
			throw new Error(`Skill already exists: ${input.name}. Pass force:true to overwrite.`);
		}
	} catch (error) {
		if (
			error instanceof Error &&
			error.message === `Skill already exists: ${input.name}. Pass force:true to overwrite.`
		) {
			throw error;
		}
		// readFileSync threw because the file doesn't exist (ENOENT) -> safe to write.
	}

	const body = `${skillFrontmatter(input.stack, input.name, input.description)}\n\n${input.content.trimEnd()}\n`;
	atomicWrite(target, body);
	return { path: target, stack: input.stack, name: input.name };
}

function atomicWrite(path: string, content: string): void {
	mkdirSync(dirname(path), { recursive: true });
	const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
	try {
		writeFileSync(temporary, content, { encoding: "utf8", mode: 0o600 });
		renameSync(temporary, path);
	} finally {
		try {
			rmSync(temporary, { force: true });
		} catch {
			// Best-effort cleanup. The atomic rename already completed when it matters.
		}
	}
}
