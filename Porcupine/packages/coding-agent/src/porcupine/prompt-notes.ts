/**
 * Prompt-notes — a lightweight supplemental-instruction layer (Prime Agent's
 * prompt_notes analog). Small, numbered, rollback-friendly notes the refiner
 * may create/append. Distinct from the immutable base system prompt: these are
 * outer-harness state the agent may load as context.
 *
 * Storage: `~/.porcupine/agent/learning/prompt-notes/<slug>.md` (one file per
 * note, atomic writes). Every change emits a learning-feed event.
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { publishFeedEntry } from "./learning-store.ts";

export const PROMPT_NOTES_DIR = "prompt-notes";
export const PROMPT_NOTE_MAX_CHARS = 4_000;

export interface PromptNote {
	slug: string;
	title: string;
	body: string;
	updatedAt: string;
}

function notesDir(agentDir: string): string {
	return join(agentDir, "learning", PROMPT_NOTES_DIR);
}

function notePath(agentDir: string, slug: string): string {
	return join(notesDir(agentDir), `${slug}.md`);
}

function safeSlug(value: string): string | undefined {
	const slug = value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);
	if (!/^[a-z0-9][a-z0-9-]{2,47}$/.test(slug)) return undefined;
	return slug;
}

function atomicWriteNote(path: string, content: string): void {
	mkdirSync(dirname(path), { recursive: true });
	const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
	try {
		writeFileSync(temporary, content, { encoding: "utf8", mode: 0o600 });
		renameSync(temporary, path);
	} finally {
		try {
			rmSync(temporary, { force: true });
		} catch {
			// Best-effort cleanup; rename already completed when it matters.
		}
	}
}

function emitNoteFeed(agentDir: string, action: "created" | "edited" | "deleted", note: PromptNote): void {
	// Every change emits a real learning-feed event (the header contract).
	publishFeedEntry(agentDir, {
		action: action === "deleted" ? "rejected" : action === "created" ? "created" : "edited",
		file: notePath(agentDir, note.slug),
		summary: `${action} prompt note ${note.slug}`,
		kind: "memory",
		proposalId: note.slug,
	});
}

/** List all prompt notes (newest first). */
export function listPromptNotes(agentDir: string): PromptNote[] {
	const dir = notesDir(agentDir);
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((name) => name.endsWith(".md"))
		.map((name) => {
			const slug = name.slice(0, -3);
			return readPromptNote(agentDir, slug);
		})
		.filter((note): note is PromptNote => note !== undefined)
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Read one prompt note. */
export function readPromptNote(agentDir: string, slug: string): PromptNote | undefined {
	if (!safeSlug(slug)) return undefined;
	try {
		const raw = readFileSync(notePath(agentDir, slug), "utf8");
		const lines = raw.split("\n");
		const title = lines[0]?.replace(/^#\s*/, "").trim() ?? slug;
		const body = lines.slice(1).join("\n").trim();
		const mtime = statSync(notePath(agentDir, slug)).mtime.toISOString();
		return { slug, title, body, updatedAt: mtime };
	} catch {
		return undefined;
	}
}

/** Create or update a prompt note. Returns the note. */
export function upsertPromptNote(
	agentDir: string,
	input: { slug?: string; title?: string; body: string },
): { ok: true; note: PromptNote } | { ok: false; error: string } {
	const slug = safeSlug(input.slug ?? input.title ?? "note");
	if (!slug) return { ok: false, error: "invalid prompt-note slug/title" };
	if (!input.body.trim()) return { ok: false, error: "empty prompt-note body" };
	const body = input.body.trim().slice(0, PROMPT_NOTE_MAX_CHARS);
	const title = (input.title ?? slug).trim().slice(0, 80) || slug;
	const existed = existsSync(notePath(agentDir, slug));
	const content = `# ${title}\n\n${body}\n`;
	atomicWriteNote(notePath(agentDir, slug), content);
	const note = readPromptNote(agentDir, slug);
	if (!note) return { ok: false, error: "could not read written prompt note" };
	emitNoteFeed(agentDir, existed ? "edited" : "created", note);
	return { ok: true, note };
}

/** Delete a prompt note. */
export function deletePromptNote(agentDir: string, slug: string): { ok: boolean } {
	if (!safeSlug(slug)) return { ok: false };
	const path = notePath(agentDir, slug);
	if (!existsSync(path)) return { ok: false };
	const note = readPromptNote(agentDir, slug);
	rmSync(path, { force: true });
	if (note) emitNoteFeed(agentDir, "deleted", note);
	return { ok: true };
}
