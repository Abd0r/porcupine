/**
 * /email — JARVIS-style ambient awareness over IMAP/SMTP.
 *
 * Provides the parse/build layer for the `/email` slash command (and is the
 * shared formatting core used by the email agent tools). It mirrors
 * bridge-commands.ts: command parsing is pure, and output is built against a
 * small context object so the TUI wires in its own EmailClient while keeping
 * this module testable and bridge-agnostic.
 *
 * Commands:
 *   /email status                     — connected host/user + folder counts
 *   /email drafts                     — list drafts
 *   /email inbox                      — list recent inbox messages
 *   /email read <id>                  — read one inbox message
 *   /email draft --to x --subject y --body z   — save a draft
 *   /email send <draftId>             — send a saved draft
 *
 * Safety: never echoes the password, never leaks stack traces, and every
 * network error is rendered as a readable one-liner.
 */

import type { EmailClient, EmailMessage, EmailMessageSummary } from "./email.ts";

const EMAIL_USAGE =
	"Usage: /email [status|drafts|inbox|read <id>|draft --to <x> --subject <y> --body <z>|send <draftId>]";

export type EmailCommand =
	| { kind: "status" }
	| { kind: "drafts" }
	| { kind: "inbox" }
	| { kind: "read"; id: number }
	| { kind: "draft"; to: string; subject: string; body: string }
	| { kind: "send"; draftId: number }
	| { kind: "invalid"; message: string };

/** Parse an inbound /email line. Returns null when the text is not a /email command. */
export function parseEmailCommand(text: string): EmailCommand | null {
	const trimmed = text.trim();
	if (!/^\/email(\s|$)/i.test(trimmed) && trimmed.toLowerCase() !== "/email") return null;
	const rest = trimmed.slice("/email".length).trim();
	if (!rest) return { kind: "status" };

	const [verb, ...tokens] = tokenizeQuoted(rest);
	const name = verb?.toLowerCase();
	if (name === "status") return { kind: "status" };
	if (name === "drafts") return { kind: "drafts" };
	if (name === "inbox") return { kind: "inbox" };

	if (name === "read") {
		const id = Number(tokens[0]);
		if (tokens.length !== 1 || !Number.isInteger(id) || id <= 0) {
			return { kind: "invalid", message: "Usage: /email read <id>" };
		}
		return { kind: "read", id };
	}

	if (name === "send") {
		const id = Number(tokens[0]);
		if (tokens.length !== 1 || !Number.isInteger(id) || id <= 0) {
			return { kind: "invalid", message: "Usage: /email send <draftId>" };
		}
		return { kind: "send", draftId: id };
	}

	if (name === "draft") {
		return parseDraftCommand(tokens);
	}

	return { kind: "invalid", message: EMAIL_USAGE };
}

function parseDraftCommand(tokens: string[]): EmailCommand {
	const flags = parseFlags(tokens);
	const to = flags["to"] ?? "";
	const subject = flags["subject"]?.trim() ?? "";
	const body = flags["body"];
	if (!to || body === undefined || subject === undefined) {
		return {
			kind: "invalid",
			message: "Usage: /email draft --to <recipient> --subject <subject> --body <body text>",
		};
	}
	return { kind: "draft", to: to.trim(), subject, body: body.trim() };
}

/** Split on whitespace but keep double-quoted segments as single tokens. */
function tokenizeQuoted(input: string): string[] {
	const tokens: string[] = [];
	const re = /"([^"]*)"|(\S+)/g;
	let match: RegExpExecArray | null = re.exec(input);
	while (match !== null) {
		tokens.push(match[1] ?? match[2]!);
		match = re.exec(input);
	}
	return tokens;
}

/** Minimal `--flag value` (and `--flag "value with spaces"`) parser. */
function parseFlags(tokens: string[]): Record<string, string | undefined> {
	const flags: Record<string, string | undefined> = {};
	let i = 0;
	while (i < tokens.length) {
		const token = tokens[i]!;
		if (token.startsWith("--")) {
			const name = token.slice(2);
			const valueToken = tokens[i + 1];
			if (name && valueToken !== undefined) {
				flags[name] = valueToken;
				i += 2;
				continue;
			}
		}
		i += 1;
	}
	return flags;
}

/** What the TUI can supply about the configured mailbox. */
export interface EmailCommandContext {
	/** Whether settings include host+user (false when the mailbox is unconfigured). */
	configured: boolean;
	/** Connection summary (never includes the password). */
	connectInfo?: { host: string; user: string; draftsFolder: string; sentFolder: string };
	/** Creates a live EmailClient (password already resolved). */
	getClient: () => EmailClient | Promise<EmailClient>;
	/** Default reason string shown when the mailbox is unconfigured. */
	unconfiguredMessage?: string;
}

/** Number of messages to show per listing. */
const LIST_LIMIT = 10;

/**
 * Build the chat reply for a parsed command. Every branch returns a clean,
 * non-secret string; throws only for true internal errors.
 */
export async function buildEmailCommandOutput(command: EmailCommand, ctx: EmailCommandContext): Promise<string> {
	if (command.kind === "invalid") return command.message;

	if (!ctx.configured) {
		return ctx.unconfiguredMessage ?? "Email is not configured. See /email setup in the docs (docs/email.md).";
	}

	const client = await ctx.getClient();

	switch (command.kind) {
		case "status": {
			const info = ctx.connectInfo;
			const line: string[] = [];
			if (info) line.push(`connected: ${info.user} @ ${info.host}`);
			try {
				const counts = await client.folderCounts();
				if (counts.length === 0) {
					line.push("folders: (none found)");
				} else {
					for (const folder of counts) {
						line.push(`  ${folder.path}: ${folder.total} message${folder.total === 1 ? "" : "s"}`);
					}
				}
			} catch (error) {
				line.push(`folders: ${error instanceof Error ? error.message : String(error)}`);
			}
			return line.join("\n");
		}
		case "drafts":
			return renderListing("Drafts", await safeList(client.listDrafts(), "Drafts"));
		case "inbox":
			return renderListing("Inbox", (await safeList(client.listInbox(), "Inbox")).slice(0, LIST_LIMIT));
		case "read": {
			try {
				const message = await client.readMessage(command.id);
				return renderMessage(message);
			} catch (error) {
				return cleanError(error, `Could not read message ${command.id}`);
			}
		}
		case "draft": {
			try {
				const result = await client.draft(command.to, command.subject, command.body);
				return `Draft saved (id ${result.draftId}) to ${command.to}. Send it with /email send ${result.draftId}.`;
			} catch (error) {
				return cleanError(error, "Could not save draft");
			}
		}
		case "send": {
			try {
				await client.send(command.draftId);
				return `Draft ${command.draftId} sent.`;
			} catch (error) {
				return cleanError(error, `Could not send draft ${command.draftId}`);
			}
		}
		default:
			return EMAIL_USAGE;
	}
}

async function safeList(promise: Promise<EmailMessageSummary[]>, folder: string): Promise<EmailMessageSummary[]> {
	try {
		return await promise;
	} catch (error) {
		// Rethrow as a readable message by the caller via cleanError below.
		throw new Error(`${folder}: ${error instanceof Error ? error.message : String(error)}`);
	}
}

function renderListing(title: string, messages: EmailMessageSummary[]): string {
	if (messages.length === 0) return `${title}: (empty)`;
	const lines = messages.map((m) => {
		const date = m.date ? ` · ${m.date.toISOString().slice(0, 10)}` : "";
		return `#${m.uid} ${m.subject} (${m.from})${date}`;
	});
	return [`${title} (${messages.length})`, ...lines].join("\n");
}

function renderMessage(message: EmailMessage): string {
	const date = message.date ? ` · ${message.date.toISOString()}` : "";
	return [
		`#${message.uid} ${message.subject}`,
		`from: ${message.from}`,
		`to: ${message.to}`,
		`date: ${date.replace("T", " ").replace("Z", "")}`,
		"",
		message.text,
	].join("\n");
}

function cleanError(error: unknown, prefix: string): string {
	const message = error instanceof Error ? error.message : String(error);
	return message ? `${prefix}: ${message}` : prefix;
}
