/**
 * Email agent tools for Porcupine.
 *
 * email_list / email_read / email_draft / email_send wrap the IMAP/SMTP EmailClient
 * behind small, typed tools the agent can call. They always return readable
 * acks or clean errors, never the password and never a full stack dump.
 */

import type { AgentTool } from "@porcupineai/agent-core";
import { Text } from "@porcupineai/tui";
import { type Static, type TSchema, Type } from "typebox";
import { getAgentDir } from "../../config.ts";
import { theme } from "../../modes/interactive/theme/theme.ts";
import type { EmailClient, EmailConfig, EmailMessageSummary } from "../../porcupine/email.ts";
import { createEmailClient, EMAIL_KEYRING_SERVICE, emailErrorMessage } from "../../porcupine/email.ts";
import type { ToolDefinition } from "../extensions/types.ts";
import { readSecret } from "../keyring.ts";
import type { EmailSettings } from "../settings-manager.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

/** Resolve the EmailClient for a tool call. */
export interface EmailToolOptions {
	/** Read email settings (host, user, folders, timeout). */
	getSettings?: () => EmailSettings | undefined;
	/** Resolve the mailbox password from the keyring. Defaults to a keyring read. */
	getPassword?: () => Promise<string | undefined>;
	/** Create the client. Defaults to the real createEmailClient. */
	createClient?: (config: EmailConfig) => EmailClient;
	/** Agent home used to derive the keyring location. Defaults to getAgentDir(). */
	agentDir?: string;
}

const emailListSchema = Type.Object({
	folder: Type.Union([Type.Literal("inbox"), Type.Literal("drafts"), Type.Literal("sent")], {
		description: "Mailbox folder to list (inbox, drafts, or sent)",
	}),
});
const emailReadSchema = Type.Object({
	id: Type.Number({ description: "Inbox message id (uid) to read" }),
});
const emailDraftSchema = Type.Object({
	to: Type.String({ description: "Recipient email address" }),
	subject: Type.String({ description: "Subject line" }),
	body: Type.String({ description: "Plain-text body" }),
});
const emailSendSchema = Type.Object({
	draftId: Type.Number({ description: "Draft id to send" }),
});

export type EmailListToolInput = Static<typeof emailListSchema>;
export type EmailReadToolInput = Static<typeof emailReadSchema>;
export type EmailDraftToolInput = Static<typeof emailDraftSchema>;
export type EmailSendToolInput = Static<typeof emailSendSchema>;

export interface EmailListDetails {
	folder: string;
	count: number;
}
export interface EmailReadDetails {
	id: number;
	subject: string;
	from: string;
}
export interface EmailDraftDetails {
	draftId: number;
	to: string;
	subject: string;
}
export interface EmailSendDetails {
	draftId: number;
}

type EmailToolDef<S extends TSchema, D> = ToolDefinition<S, D | undefined>;

const LIST_LIMIT = 10;

async function resolveClient(options: EmailToolOptions): Promise<EmailClient> {
	const settings = options.getSettings?.();
	if (!settings || (!settings.host && !settings.user)) {
		throw new Error(
			"Email is not configured. Set host and user in the email settings block, then set the app password via /email.",
		);
	}
	if (!settings.user) throw new Error("Email user is not configured.");
	const agentDir = options.agentDir ?? getAgentDir();
	const pass = options.getPassword?.() ?? readSecret(agentDir, EMAIL_KEYRING_SERVICE, settings.user);
	const create = options.createClient ?? createEmailClient;
	return create({
		host: settings.host ?? "",
		port: settings.port ?? (settings.secure === false ? 143 : 993),
		secure: settings.secure ?? true,
		user: settings.user,
		pass: await pass,
		draftsFolder: settings.draftsFolder ?? "Drafts",
		sentFolder: settings.sentFolder ?? "Sent Mail",
		timeoutMs: settings.timeoutMs ?? 15000,
	});
}

function renderListing(messages: EmailMessageSummary[]): string {
	if (messages.length === 0) return "(empty)";
	return messages
		.map((m) => `#${m.uid} ${m.subject} (${m.from}${m.date ? `, ${m.date.toISOString().slice(0, 10)}` : ""})`)
		.join("\n");
}

function renderToolTitle(name: string): string {
	return theme.fg("toolTitle", theme.bold(name));
}

function textContent(content: Array<{ type: string; text?: string }>): string {
	return (content ?? []).map((c) => (c && c.type === "text" ? (c.text ?? "") : "")).join("");
}

export function createEmailListToolDefinition(
	options: EmailToolOptions = {},
): EmailToolDef<typeof emailListSchema, EmailListDetails> {
	return {
		name: "email_list",
		label: "email_list",
		description:
			"List recent messages in a mailbox folder (inbox, drafts, or sent). Requires email to be configured. Returns a readable list of message ids, subjects, and senders.",
		promptSnippet: "List mailbox folder messages",
		promptGuidelines: [
			"Use email_list to read inbox, drafts, or sent. ids are reusable with email_read / email_send.",
		],
		parameters: emailListSchema,
		async execute(_toolCallId, { folder }) {
			try {
				const client = await resolveClient(options);
				const path = folder;
				let messages: EmailMessageSummary[];
				if (folder === "drafts") messages = await client.listDrafts();
				else if (folder === "sent") messages = await client.listSent();
				else messages = await client.listInbox();
				const limited = messages.slice(0, LIST_LIMIT);
				return {
					content: [{ type: "text", text: renderListing(limited) }],
					details: { folder: path, count: limited.length },
				};
			} catch (error) {
				return {
					content: [{ type: "text", text: `${folder} list: ${emailErrorMessage(error)}` }],
					details: undefined,
				};
			}
		},
		renderCall(args) {
			const folder = typeof args?.folder === "string" ? args.folder : "...";
			return new Text(`${renderToolTitle("email_list")} ${theme.fg("toolOutput", folder)}`, 0, 0);
		},
		renderResult(result) {
			const text = textContent(result.content ?? []);
			return new Text(`\n${theme.fg("toolOutput", text || "(empty)")}`, 0, 0);
		},
	};
}

export function createEmailReadToolDefinition(
	options: EmailToolOptions = {},
): EmailToolDef<typeof emailReadSchema, EmailReadDetails> {
	return {
		name: "email_read",
		label: "email_read",
		description:
			"Read the body of one inbox message by id. Returns the subject, from, to, date, and plain-text body. HTML is downgraded to text; attachments are not included in v1.",
		promptSnippet: "Read an inbox message body",
		promptGuidelines: ["Use email_read only after email_list gives you a message id."],
		parameters: emailReadSchema,
		async execute(_toolCallId, { id }) {
			try {
				const client = await resolveClient(options);
				const message = await client.readMessage(id);
				return {
					content: [
						{
							type: "text",
							text: `#${message.uid} ${message.subject}\nfrom: ${message.from}\nto: ${message.to}\n\n${message.text}`,
						},
					],
					details: { id: message.uid, subject: message.subject, from: message.from },
				};
			} catch (error) {
				return {
					content: [{ type: "text", text: `read: ${emailErrorMessage(error)}` }],
					details: undefined,
				};
			}
		},
		renderCall(args) {
			const id = typeof args?.id === "number" ? String(args.id) : "...";
			return new Text(`${renderToolTitle("email_read")} ${theme.fg("toolOutput", id)}`, 0, 0);
		},
		renderResult(result, options) {
			const text = textContent(result.content ?? []);
			const preview = options.expanded ? text : text.split("\n").slice(0, 12).join("\n");
			return new Text(`\n${theme.fg("toolOutput", preview || "(empty)")}`, 0, 0);
		},
	};
}

export function createEmailDraftToolDefinition(
	options: EmailToolOptions = {},
): EmailToolDef<typeof emailDraftSchema, EmailDraftDetails> {
	return {
		name: "email_draft",
		label: "email_draft",
		description:
			"Compose and save a plain-text draft into the drafts folder. Returns an ack plus the draft id, which email_send uses to send it. Attachments are not supported in v1.",
		promptSnippet: "Save an email draft",
		promptGuidelines: [
			"Use email_draft to prepare an outbound message, then email_send with the returned draft id to send it.",
		],
		parameters: emailDraftSchema,
		async execute(_toolCallId, args) {
			try {
				const client = await resolveClient(options);
				const result = await client.draft(args.to, args.subject, args.body);
				return {
					content: [
						{
							type: "text",
							text: `Draft saved (id ${result.draftId}) to ${args.to}. Send with email_send draftId ${result.draftId}.`,
						},
					],
					details: { draftId: result.draftId, to: args.to, subject: args.subject },
				};
			} catch (error) {
				return {
					content: [{ type: "text", text: `draft: ${emailErrorMessage(error)}` }],
					details: undefined,
				};
			}
		},
		renderCall(args) {
			const to = typeof args?.to === "string" ? args.to : "...";
			return new Text(`${renderToolTitle("email_draft")} ${theme.fg("toolOutput", `to ${to}`)}`, 0, 0);
		},
		renderResult(result) {
			const text = textContent(result.content ?? []);
			return new Text(`\n${theme.fg("toolOutput", text || "(empty)")}`, 0, 0);
		},
	};
}

export function createEmailSendToolDefinition(
	options: EmailToolOptions = {},
): EmailToolDef<typeof emailSendSchema, EmailSendDetails> {
	return {
		name: "email_send",
		label: "email_send",
		description:
			"Send a previously saved email draft by its draft id. Requires email to be configured with an SMTP app password.",
		promptSnippet: "Send an email draft",
		promptGuidelines: ["Use email_send only after email_draft returns a draft id."],
		parameters: emailSendSchema,
		async execute(_toolCallId, { draftId }) {
			try {
				const client = await resolveClient(options);
				await client.send(draftId);
				return {
					content: [{ type: "text", text: `Draft ${draftId} sent.` }],
					details: { draftId },
				};
			} catch (error) {
				return {
					content: [{ type: "text", text: `send: ${emailErrorMessage(error)}` }],
					details: undefined,
				};
			}
		},
		renderCall(args) {
			const id = typeof args?.draftId === "number" ? String(args.draftId) : "...";
			return new Text(`${renderToolTitle("email_send")} ${theme.fg("toolOutput", id)}`, 0, 0);
		},
		renderResult(result) {
			const text = textContent(result.content ?? []);
			return new Text(`\n${theme.fg("toolOutput", text || "(empty)")}`, 0, 0);
		},
	};
}

export function createEmailListTool(options: EmailToolOptions = {}): AgentTool<typeof emailListSchema> {
	return wrapToolDefinition(createEmailListToolDefinition(options));
}
export function createEmailReadTool(options: EmailToolOptions = {}): AgentTool<typeof emailReadSchema> {
	return wrapToolDefinition(createEmailReadToolDefinition(options));
}
export function createEmailDraftTool(options: EmailToolOptions = {}): AgentTool<typeof emailDraftSchema> {
	return wrapToolDefinition(createEmailDraftToolDefinition(options));
}
export function createEmailSendTool(options: EmailToolOptions = {}): AgentTool<typeof emailSendSchema> {
	return wrapToolDefinition(createEmailSendToolDefinition(options));
}
