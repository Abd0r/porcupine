/**
 * Read-only formatting helpers for the /subagents slash command.
 * Both functions are pure: they take already-loaded session summaries and
 * return text for the chat panel. Never mutate state.
 */

import type { SubagentSessionSummary } from "./subagent-sessions.ts";

/** Render a compact, newest-first listing of recent sub-agent sessions. */
export function formatSubagentSessionList(sessions: SubagentSessionSummary[]): string {
	if (sessions.length === 0) {
		return "No sub-agent sessions persisted yet.";
	}
	const lines = sessions.slice(0, 50).map((s) => {
		const status = s.ok ? "done" : s.budgetExhausted ? "budget-exhausted" : "failed";
		const when = s.created.toISOString().slice(0, 19);
		const id = s.sessionId;
		const task = s.task?.replace(/\s+/g, " ").trim().slice(0, 90) || "(no task)";
		return `id=${id} status=${status} steps=${s.steps} when=${when}\n  ${task}`;
	});
	return ["Recent sub-agent sessions (newest first):", "", ...lines].join("\n");
}

/**
 * Render the transcript summary for one sub-agent session by id.
 * Falls back to a helpful hint when the id is unknown.
 */
export function formatSubagentSessionView(sessions: SubagentSessionSummary[], sessionId: string): string {
	const session = sessions.find((s) => s.sessionId === sessionId) ?? sessions.find((s) => s.path.includes(sessionId));
	if (!session) {
		return [
			`No sub-agent session found for ${JSON.stringify(sessionId)}.`,
			"Run /subagents with no argument to list recent ids.",
		].join("\n");
	}
	const generic = session as SubagentSessionSummary & { task?: string; subagentId?: string; parentSessionId?: string };
	const status = session.ok ? "done" : session.budgetExhausted ? "budget exhausted" : "failed";
	const lines = [
		`Sub-agent ${generic.subagentId ?? "(unknown id)"}`,
		`session id:   ${session.sessionId}`,
		`parent:       ${generic.parentSessionId ?? "(unknown)"}`,
		`status:       ${status} (${session.steps} steps, ${session.messageCount} messages)`,
		`started:      ${session.created.toISOString()}`,
		`file:         ${session.path}`,
		"",
		"Task:",
		generic.task ? generic.task : "(not recorded)",
	];
	return lines.join("\n");
}
