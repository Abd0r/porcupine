/**
 * Durable Porcupine memory: MEMORY.md (agent notes) + USER.md (user profile).
 * Injected into the system prompt every turn; mutated via the memory tool.
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type MemoryTarget = "memory" | "user";
export type MemoryAction = "add" | "replace" | "remove" | "list";

export const MEMORY_FILE = "MEMORY.md";
export const USER_FILE = "USER.md";

export const MEMORY_CHAR_LIMIT = 8_000;
export const USER_CHAR_LIMIT = 4_000;

const DEFAULT_MEMORY = `# MEMORY

Durable agent notes (preferences learned, environment facts, stable conventions).
Keep compact. Prefer short bullets.

`;

const DEFAULT_USER = `# USER

Who the user is — stable prefs, corrections, workflow facts.
Lines may use: - [category:key] fact

`;

export interface MemoryEntry {
	/** 1-based line number in the file body (after header). */
	index: number;
	text: string;
}

export interface MemoryMutationResult {
	ok: boolean;
	target: MemoryTarget;
	action: MemoryAction;
	file: string;
	message: string;
	content: string;
	chars: number;
	limit: number;
	entries?: MemoryEntry[];
}

function atomicWrite(path: string, content: string): void {
	mkdirSync(dirname(path), { recursive: true });
	const tmp = join(dirname(path), `.${randomUUID()}.tmp`);
	try {
		writeFileSync(tmp, content, { encoding: "utf8", mode: 0o600 });
		renameSync(tmp, path);
	} finally {
		try {
			rmSync(tmp, { force: true });
		} catch {
			/* ignore */
		}
	}
}

export function memoryPath(agentDir: string, target: MemoryTarget): string {
	return join(agentDir, target === "user" ? USER_FILE : MEMORY_FILE);
}

export function charLimit(target: MemoryTarget): number {
	return target === "user" ? USER_CHAR_LIMIT : MEMORY_CHAR_LIMIT;
}

export function defaultContent(target: MemoryTarget): string {
	return target === "user" ? DEFAULT_USER : DEFAULT_MEMORY;
}

export function readMemoryFile(agentDir: string, target: MemoryTarget): string {
	const path = memoryPath(agentDir, target);
	if (!existsSync(path)) return defaultContent(target);
	try {
		return readFileSync(path, "utf8");
	} catch {
		return defaultContent(target);
	}
}

export function ensureMemoryFiles(agentDir: string): void {
	mkdirSync(agentDir, { recursive: true });
	for (const target of ["memory", "user"] as const) {
		const path = memoryPath(agentDir, target);
		if (!existsSync(path)) {
			atomicWrite(path, defaultContent(target));
		}
	}
}

/** Bullet / non-empty lines under the heading, for list/remove/replace. */
export function listEntries(content: string): MemoryEntry[] {
	const lines = content.replace(/\r\n/g, "\n").split("\n");
	const entries: MemoryEntry[] = [];
	let i = 0;
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		if (trimmed.startsWith("#")) continue;
		i += 1;
		entries.push({ index: i, text: trimmed.replace(/^- /, "") });
	}
	return entries;
}

function rebuildFromEntries(target: MemoryTarget, entries: MemoryEntry[]): string {
	const header = target === "user" ? "# USER\n\n" : "# MEMORY\n\n";
	if (entries.length === 0) return header;
	return `${header + entries.map((e) => `- ${e.text}`).join("\n")}\n`;
}

export function mutateMemory(
	agentDir: string,
	action: MemoryAction,
	target: MemoryTarget,
	opts: { content?: string; oldText?: string } = {},
): MemoryMutationResult {
	ensureMemoryFiles(agentDir);
	const file = memoryPath(agentDir, target);
	const limit = charLimit(target);
	let body = readMemoryFile(agentDir, target);
	const entries = listEntries(body);

	if (action === "list") {
		return {
			ok: true,
			target,
			action,
			file,
			message: `${entries.length} entries (${body.length}/${limit} chars)`,
			content: body,
			chars: body.length,
			limit,
			entries,
		};
	}

	if (action === "add") {
		const fact = (opts.content ?? "").trim();
		if (!fact) {
			return {
				ok: false,
				target,
				action,
				file,
				message: "content is required for add",
				content: body,
				chars: body.length,
				limit,
			};
		}
		// de-dupe exact
		if (entries.some((e) => e.text === fact || e.text.endsWith(fact))) {
			return {
				ok: true,
				target,
				action,
				file,
				message: "already present",
				content: body,
				chars: body.length,
				limit,
				entries,
			};
		}
		entries.push({ index: entries.length + 1, text: fact });
	} else if (action === "replace") {
		const oldText = (opts.oldText ?? "").trim();
		const fact = (opts.content ?? "").trim();
		if (!oldText || !fact) {
			return {
				ok: false,
				target,
				action,
				file,
				message: "oldText and content are required for replace",
				content: body,
				chars: body.length,
				limit,
			};
		}
		const idx = entries.findIndex((e) => e.text.includes(oldText));
		if (idx < 0) {
			return {
				ok: false,
				target,
				action,
				file,
				message: `no entry matching oldText: ${oldText}`,
				content: body,
				chars: body.length,
				limit,
				entries,
			};
		}
		entries[idx] = { index: entries[idx].index, text: fact };
	} else if (action === "remove") {
		const oldText = (opts.oldText ?? opts.content ?? "").trim();
		if (!oldText) {
			return {
				ok: false,
				target,
				action,
				file,
				message: "oldText (or content) is required for remove",
				content: body,
				chars: body.length,
				limit,
			};
		}
		const next = entries.filter((e) => !e.text.includes(oldText));
		if (next.length === entries.length) {
			return {
				ok: false,
				target,
				action,
				file,
				message: `no entry matching: ${oldText}`,
				content: body,
				chars: body.length,
				limit,
				entries,
			};
		}
		entries.length = 0;
		entries.push(...next.map((e, i) => ({ index: i + 1, text: e.text })));
	}

	body = rebuildFromEntries(target, entries);
	if (body.length > limit) {
		return {
			ok: false,
			target,
			action,
			file,
			message: `would exceed ${limit} char limit (${body.length}). Remove/shorten entries first.`,
			content: readMemoryFile(agentDir, target),
			chars: readMemoryFile(agentDir, target).length,
			limit,
			entries: listEntries(readMemoryFile(agentDir, target)),
		};
	}

	atomicWrite(file, body);
	return {
		ok: true,
		target,
		action,
		file,
		message: `${action} ok`,
		content: body,
		chars: body.length,
		limit,
		entries: listEntries(body),
	};
}

/** Block injected into the system prompt when files have substance. */
export function formatMemoryForPrompt(agentDir: string): string {
	ensureMemoryFiles(agentDir);
	const mem = readMemoryFile(agentDir, "memory").trim();
	const user = readMemoryFile(agentDir, "user").trim();
	const parts: string[] = [];

	const userEntries = listEntries(user);
	const memEntries = listEntries(mem);

	if (userEntries.length > 0) {
		parts.push(`<user_profile path="${USER_FILE}">\n${user}\n</user_profile>`);
	}
	if (memEntries.length > 0) {
		parts.push(`<agent_memory path="${MEMORY_FILE}">\n${mem}\n</agent_memory>`);
	}
	if (parts.length === 0) return "";
	return `\n\n<porcupine_memory>\n${parts.join("\n\n")}\n</porcupine_memory>`;
}

/**
 * Heuristic extractor for user-pattern learning (no LLM).
 * Picks durable prefs/corrections from plain user text.
 */
export function extractUserPatternsHeuristic(message: string): Array<{
	key: string;
	category: "preference" | "correction" | "workflow" | "context";
	fact: string;
	confidence: number;
	evidence: string[];
	sensitive: boolean;
	temporary: boolean;
}> {
	const text = message.trim();
	if (text.length < 12 || text.length > 2000) return [];

	const patterns: Array<{
		re: RegExp;
		category: "preference" | "correction" | "workflow" | "context";
		confidence: number;
	}> = [
		{ re: /\b(?:i\s+)?prefer\s+(.+?)(?:\.|$)/i, category: "preference", confidence: 0.9 },
		{ re: /\balways\s+(.+?)(?:\.|$)/i, category: "preference", confidence: 0.85 },
		{ re: /\bnever\s+(.+?)(?:\.|$)/i, category: "correction", confidence: 0.9 },
		{ re: /\bdon'?t\s+(.+?)(?:\.|$)/i, category: "correction", confidence: 0.85 },
		{ re: /\bremember\s+(?:that\s+)?(.+?)(?:\.|$)/i, category: "context", confidence: 0.9 },
		{ re: /\bfrom\s+now\s+on[,\s]+(.+?)(?:\.|$)/i, category: "workflow", confidence: 0.88 },
		{ re: /\bmy\s+(?:default|usual)\s+(.+?)(?:\.|$)/i, category: "preference", confidence: 0.86 },
	];

	const out: Array<{
		key: string;
		category: "preference" | "correction" | "workflow" | "context";
		fact: string;
		confidence: number;
		evidence: string[];
		sensitive: boolean;
		temporary: boolean;
	}> = [];

	const sensitive = /\b(password|api[_-]?key|token|secret|ssn|credit\s*card)\b/i.test(text);

	for (const p of patterns) {
		const m = text.match(p.re);
		if (!m?.[1]) continue;
		const fact = m[0].trim().replace(/\s+/g, " ").slice(0, 240);
		const key = fact
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "")
			.slice(0, 48);
		if (!key) continue;
		out.push({
			key,
			category: p.category,
			fact,
			confidence: p.confidence,
			evidence: [text.slice(0, 400)],
			sensitive,
			temporary: /\b(today|this\s+once|for\s+now|temporary)\b/i.test(text),
		});
	}
	return out;
}
