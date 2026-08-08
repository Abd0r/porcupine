/**
 * Search past Porcupine sessions (JSONL under ~/.porcupine/agent/sessions).
 */

import { existsSync } from "node:fs";
import type { AgentTool } from "@porcupineai/agent-core";
import { Text } from "@porcupineai/tui";
import { type Static, Type } from "typebox";
import { theme } from "../../modes/interactive/theme/theme.ts";
import type { ToolDefinition } from "../extensions/types.ts";
import { loadEntriesFromFile, type SessionInfo, SessionManager } from "../session-manager.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

const sessionSearchSchema = Type.Object({
	query: Type.Optional(
		Type.String({
			description: "Keywords to find in past sessions. Omit to browse recent sessions.",
		}),
	),
	limit: Type.Optional(Type.Number({ description: "Max sessions to return (default 5, max 20)" })),
	sessionId: Type.Optional(
		Type.String({ description: "Open one session by id and return recent user/assistant text" }),
	),
	scope: Type.Optional(
		Type.Union([Type.Literal("cwd"), Type.Literal("all")], {
			description: "cwd = this project only (default); all = every project under agent sessions",
		}),
	),
});

export type SessionSearchToolInput = Static<typeof sessionSearchSchema>;

export interface SessionSearchToolDetails {
	count: number;
	scope: string;
}

export interface SessionSearchToolOptions {
	cwd?: string;
}

function tokenize(q: string): string[] {
	return q
		.toLowerCase()
		.split(/[^a-z0-9_./-]+/i)
		.map((t) => t.trim())
		.filter((t) => t.length >= 2);
}

function scoreSession(session: SessionInfo, tokens: string[]): number {
	if (tokens.length === 0) return 1;
	const hay = `${session.name ?? ""} ${session.firstMessage} ${session.allMessagesText}`.toLowerCase();
	let score = 0;
	for (const t of tokens) {
		if (hay.includes(t)) score += 1;
	}
	return score;
}

function snippet(session: SessionInfo, tokens: string[], max = 280): string {
	const text = (session.allMessagesText || session.firstMessage || "").replace(/\s+/g, " ").trim();
	if (!text) return "(no text)";
	if (tokens.length === 0) return text.slice(0, max);
	const lower = text.toLowerCase();
	let best = 0;
	for (const t of tokens) {
		const i = lower.indexOf(t);
		if (i >= 0) {
			best = Math.max(0, i - 40);
			break;
		}
	}
	return text.slice(best, best + max);
}

function formatSessionHit(session: SessionInfo, tokens: string[]): string {
	const when = session.modified.toISOString().slice(0, 19);
	const name = session.name ? ` "${session.name}"` : "";
	return [
		`id=${session.id}${name}`,
		`when=${when} msgs=${session.messageCount} cwd=${session.cwd || "(unknown)"}`,
		`first: ${session.firstMessage.replace(/\s+/g, " ").trim().slice(0, 160)}`,
		`match: ${snippet(session, tokens)}`,
		`path: ${session.path}`,
	].join("\n");
}

function readSessionMessages(path: string, maxMessages = 24): string {
	if (!existsSync(path)) return `(session file missing: ${path})`;
	const entries = loadEntriesFromFile(path);
	const lines: string[] = [];
	for (const entry of entries) {
		if (entry.type !== "message") continue;
		const msg = entry.message as { role?: string; content?: unknown };
		const role = msg.role ?? "unknown";
		if (role !== "user" && role !== "assistant") continue;
		let text = "";
		if (typeof msg.content === "string") text = msg.content;
		else if (Array.isArray(msg.content)) {
			text = msg.content
				.map((c: { type?: string; text?: string }) => (c?.type === "text" ? (c.text ?? "") : ""))
				.join("");
		}
		text = text.replace(/\s+/g, " ").trim();
		if (!text) continue;
		lines.push(`${role}: ${text.slice(0, 500)}`);
	}
	const tail = lines.slice(-maxMessages);
	return tail.length ? tail.join("\n") : "(no user/assistant messages)";
}

export function createSessionSearchToolDefinition(
	options?: SessionSearchToolOptions,
): ToolDefinition<typeof sessionSearchSchema, SessionSearchToolDetails | undefined> {
	const cwd = options?.cwd ?? process.cwd();

	return {
		name: "session_search",
		label: "session_search",
		description:
			"Search past Porcupine conversation sessions on disk. Use for 'what did we do about X', 'where did we leave Y', or browsing recent sessions. Pass sessionId to open one session's recent messages.",
		promptSnippet: "Search past session history (JSONL)",
		promptGuidelines: [
			"Use session_search for prior conversation recall — not for current file/repo state.",
			"Omit query to list recent sessions; pass query for keyword search; pass sessionId to read one session.",
			"Session search does not replace MEMORY.md — durable facts belong in the memory tool.",
		],
		parameters: sessionSearchSchema,
		async execute(_toolCallId, args) {
			const limit = Math.max(1, Math.min(20, Math.floor(args.limit ?? 5)));
			const scope = args.scope === "all" ? "all" : "cwd";
			const tokens = tokenize(args.query ?? "");

			if (args.sessionId) {
				const sessions =
					scope === "all"
						? await SessionManager.listAll(undefined, undefined, { includeSubagents: true })
						: await SessionManager.list(cwd, undefined, undefined, { includeSubagents: true });
				const hit =
					sessions.find((s) => s.id === args.sessionId) || sessions.find((s) => s.path.includes(args.sessionId!));
				if (!hit) {
					return {
						content: [
							{
								type: "text",
								text: `No session found for id=${args.sessionId} (scope=${scope}). Try session_search without sessionId first.`,
							},
						],
						details: { count: 0, scope },
					};
				}
				const body = [
					formatSessionHit(hit, tokens),
					"",
					"--- recent messages ---",
					readSessionMessages(hit.path),
				].join("\n");
				return {
					content: [{ type: "text", text: body }],
					details: { count: 1, scope },
				};
			}

			const sessions =
				scope === "all"
					? await SessionManager.listAll(undefined, undefined, { includeSubagents: true })
					: await SessionManager.list(cwd, undefined, undefined, { includeSubagents: true });

			let ranked: SessionInfo[];
			if (tokens.length === 0) {
				ranked = sessions.slice(0, limit);
			} else {
				ranked = sessions
					.map((s) => ({ s, score: scoreSession(s, tokens) }))
					.filter((x) => x.score > 0)
					.sort((a, b) => b.score - a.score || b.s.modified.getTime() - a.s.modified.getTime())
					.slice(0, limit)
					.map((x) => x.s);
			}

			if (ranked.length === 0) {
				return {
					content: [
						{
							type: "text",
							text: tokens.length
								? `No sessions matched query=${JSON.stringify(args.query)} (scope=${scope}).`
								: `No sessions found (scope=${scope}).`,
						},
					],
					details: { count: 0, scope },
				};
			}

			const blocks = ranked.map((s, i) => `### ${i + 1}\n${formatSessionHit(s, tokens)}`);
			const header = `Found ${ranked.length} session(s) scope=${scope}${args.query ? ` query=${JSON.stringify(args.query)}` : " (recent)"}`;
			return {
				content: [{ type: "text", text: `${header}\n\n${blocks.join("\n\n")}` }],
				details: { count: ranked.length, scope },
			};
		},
		renderCall(args) {
			const q = args?.sessionId ? `id=${args.sessionId}` : args?.query ? String(args.query) : "(recent)";
			return new Text(`${theme.fg("toolTitle", theme.bold("session_search"))} ${theme.fg("toolOutput", q)}`, 0, 0);
		},
		renderResult(result, options) {
			const text = (result.content ?? [])
				.map((c) => (c.type === "text" ? c.text : ""))
				.join("")
				.trim();
			const preview = options.expanded ? text : text.split("\n").slice(0, 16).join("\n");
			return new Text(`\n${theme.fg("toolOutput", preview || "(empty)")}`, 0, 0);
		},
	};
}

export function createSessionSearchTool(options?: SessionSearchToolOptions): AgentTool<typeof sessionSearchSchema> {
	return wrapToolDefinition(createSessionSearchToolDefinition(options));
}
