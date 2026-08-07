/**
 * iMessage bridge for Porcupine (macOS only) — the Messages app becomes a
 * remote control for the SAME session (Telegram-bridge contract: provenance
 * matching, TUI↔phone racing, agent_end forwarding).
 *
 * No API: sending and polling go through AppleScript (`osascript`) against the
 * signed-in Messages.app. Confirmation and option selection are text-based
 * (reply APPROVE/DENY or a number).
 *
 * Requirements: macOS + Messages.app signed in (iMessage enabled).
 *
 * Env:
 *   PORCUPINE_IMESSAGE_ALLOW — comma-separated chat ids (e.g.
 *                              "iMessage;-;+1234567890") or phone/email handles
 *                              (resolved to a chat id at startup when possible)
 */

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { AgentMessage } from "@porcupineai/agent-core";
import { extractAssistantText, lastUserMessageText, summarizeToolCalls, textsMatch } from "./telegram-bridge.ts";

const POLL_INTERVAL_MS = 3000;
const SEND_CHUNK = 1500;
const MAX_SEEN_IDS = 1000;
const SEP = "\u0001";

function appleScriptEscape(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export interface IMessageBridgeOptions {
	/** Chat ids (or phone/email handles) allowed to drive the session. */
	allowlist: string[];
	prompt: (text: string, options?: { streamingBehavior?: "followUp" | "steer" }) => Promise<void>;
	getStatus?: () => string;
	dialogTimeoutMs?: number;
	confirmTimeoutMs?: number;
}

export class IMessageBridge {
	private readonly options: IMessageBridgeOptions;
	private running = false;
	private pollTimer: ReturnType<typeof setInterval> | undefined;
	/** Resolved chat ids to poll (handles resolved at startup when possible). */
	private pollChats: string[] = [];
	private seenIds = new Set<string>();

	/** iMessage-originated prompts awaiting their response turn (provenance match). */
	private pendingMessages: Array<{ chatId: string; text: string }> = [];
	/** Most recent chat that sent a real prompt; confirmations go there. */
	private activeChatId: string | undefined;
	private pendingConfirms = new Map<string, { chatId: string; resolve: (ok: boolean) => void }>();
	private pendingSelects = new Map<string, { options: string[]; resolve: (value: string | undefined) => void }>();
	private pendingTextRequest: { chatId: string; resolve: (value: string | undefined) => void } | undefined;

	constructor(options: IMessageBridgeOptions) {
		this.options = options;
	}

	get isRunning(): boolean {
		return this.running;
	}

	get pendingTurns(): number {
		return this.pendingMessages.length;
	}

	// ---------------------------------------------------------------------
	// AppleScript helpers
	// ---------------------------------------------------------------------

	private osascript(script: string): Promise<string> {
		return new Promise((resolve, reject) => {
			execFile("osascript", ["-e", script], { timeout: 30_000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(stdout);
			});
		});
	}

	/** Send an outbound notification to the most recently active chat (if any). Attended-only; silently skipped when no chat has prompted yet. */
	async notifyTaskResult(text: string): Promise<void> {
		if (!text || this.activeChatId === undefined) return;
		await this.sendText(this.activeChatId, text).catch(() => {});
	}

	async sendText(chatId: string, text: string): Promise<void> {
		if (!text) return;
		for (let i = 0; i < text.length; i += SEND_CHUNK) {
			const chunk = text.slice(i, i + SEND_CHUNK);
			const script = `tell application "Messages"\nsend "${appleScriptEscape(chunk)}" to chat id "${appleScriptEscape(chatId)}"\nend tell`;
			try {
				await this.osascript(script);
			} catch (error) {
				console.warn(`[imessage] send failed: ${error instanceof Error ? error.message : String(error)}`);
				return;
			}
		}
	}

	private listChatIds(): Promise<string[]> {
		return this.osascript(
			'tell application "Messages"\nset out to ""\nrepeat with c in chats\nset out to out & (id of c) & linefeed\nend repeat\nreturn out\nend tell',
		).then((stdout) =>
			stdout
				.split("\n")
				.map((line) => line.trim())
				.filter(Boolean),
		);
	}

	private fetchChatMessages(chatId: string): Promise<Array<{ id: string; text: string; fromMe: boolean }>> {
		const script = [
			'tell application "Messages"',
			`\tset chatId to "${appleScriptEscape(chatId)}"`,
			"\tset sep to ASCII character 1",
			'\tset out to ""',
			"\trepeat with m in messages of chat id chatId",
			"\t\tset out to out & (id of m) & sep & (text of m) & sep & (is from me of m) & linefeed",
			"\tend repeat",
			"\treturn out",
			"end tell",
		].join("\n");
		return this.osascript(script).then((stdout) => {
			const result: Array<{ id: string; text: string; fromMe: boolean }> = [];
			for (const line of stdout.split("\n")) {
				const parts = line.split(SEP);
				if (parts.length !== 3) continue;
				const [id, text = "", fromMeRaw] = parts;
				if (!id) continue;
				result.push({ id, text, fromMe: fromMeRaw?.trim() === "true" });
			}
			return result;
		});
	}

	/** Resolve a phone/email handle to a chat id when possible. */
	private async resolveAllowlist(entries: string[]): Promise<string[]> {
		const resolved: string[] = [];
		const needsResolve: string[] = [];
		for (const entry of entries) {
			if (entry.includes(";-;")) {
				resolved.push(entry);
			} else {
				needsResolve.push(entry);
			}
		}
		if (needsResolve.length === 0) return resolved;
		const chatIds = await this.listChatIds().catch(() => []);
		for (const entry of needsResolve) {
			const handle = entry.replace(/^\+/, "");
			const match = chatIds.find((id) => {
				const parts = id.split(";-;").slice(1);
				return parts.some((part) => part === entry || part === handle);
			});
			resolved.push(match ?? entry);
		}
		return resolved;
	}

	// ---------------------------------------------------------------------
	// Confirmation / selection / input (text-based, same contract as Telegram)
	// ---------------------------------------------------------------------

	remoteConfirm(title: string, message: string): Promise<boolean> | undefined {
		const chatId = this.activeChatId;
		if (chatId === undefined) return undefined;
		return new Promise<boolean>((resolve) => {
			const requestId = randomUUID();
			const waiter = (ok: boolean) => {
				this.pendingConfirms.delete(requestId);
				resolve(ok);
			};
			this.pendingConfirms.set(requestId, { chatId, resolve: waiter });
			const timeout = this.options.confirmTimeoutMs ?? 5 * 60 * 1000;
			setTimeout(() => waiter(false), timeout);
			void this.sendText(chatId, `❓ ${title}\n\n${message}\n\nReply APPROVE to allow, DENY to block.`).catch(() =>
				waiter(false),
			);
		});
	}

	async select(
		title: string,
		options: string[],
		tui: (title: string, options: string[]) => Promise<string | undefined>,
		opts?: { signal?: AbortSignal },
	): Promise<string | undefined> {
		const chatId = this.activeChatId;
		const tuiPromise = tui(title, options);
		if (chatId === undefined || options.length === 0) return tuiPromise;

		const requestId = randomUUID();
		const numbered = options.map((option, index) => `${index + 1}. ${option}`).join("\n");
		await this.sendText(chatId, `❓ ${title}\n\n${numbered}\n\nReply with a number.`).catch(() => {});

		return new Promise<string | undefined>((resolve) => {
			let settled = false;
			const finish = (value: string | undefined) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				this.pendingSelects.delete(requestId);
				resolve(value);
			};
			const timer = setTimeout(() => finish(undefined), this.options.dialogTimeoutMs ?? 10 * 60 * 1000);
			this.pendingSelects.set(requestId, { options, resolve: finish });
			opts?.signal?.addEventListener("abort", () => finish(undefined), { once: true });
			void tuiPromise.then((value) => finish(value));
		});
	}

	async input(
		title: string,
		tui: (title: string) => Promise<string | undefined>,
		opts?: { signal?: AbortSignal },
	): Promise<string | undefined> {
		const chatId = this.activeChatId;
		const tuiPromise = tui(title);
		if (chatId === undefined) return tuiPromise;
		const pending = new Promise<string | undefined>((resolve) => {
			let settled = false;
			const finish = (value: string | undefined) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				if (this.pendingTextRequest?.resolve === finish) this.pendingTextRequest = undefined;
				resolve(value);
			};
			const timer = setTimeout(() => finish(undefined), this.options.dialogTimeoutMs ?? 10 * 60 * 1000);
			this.pendingTextRequest = { chatId, resolve: finish };
			opts?.signal?.addEventListener("abort", () => finish(undefined), { once: true });
			void tuiPromise.then((value) => finish(value));
		});
		await this.sendText(chatId, `⌨️ ${title}\n\nReply with your answer.`).catch(() => {});
		return pending;
	}

	// ---------------------------------------------------------------------
	// Session events
	// ---------------------------------------------------------------------

	async handleAgentEnd(messages: readonly AgentMessage[], willRetry: boolean): Promise<void> {
		if (willRetry) return;
		const lastUserText = lastUserMessageText(messages);
		const index = this.pendingMessages.findIndex(
			(entry) => lastUserText !== undefined && textsMatch(entry.text, lastUserText),
		);
		if (index === -1) return;
		const entry = this.pendingMessages[index]!;
		this.pendingMessages.splice(index, 1);
		try {
			const raw = extractAssistantText(messages);
			const tools = summarizeToolCalls(messages);
			const body = [raw, tools ? `\n${tools}` : ""].join("").trim();
			await this.sendText(entry.chatId, body || "Done.");
		} catch (error) {
			console.warn(
				`[imessage] failed to forward response: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	// ---------------------------------------------------------------------
	// Polling
	// ---------------------------------------------------------------------

	private async pollChat(chatId: string): Promise<void> {
		let messages: Array<{ id: string; text: string; fromMe: boolean }>;
		try {
			messages = await this.fetchChatMessages(chatId);
		} catch (error) {
			// Chat may not exist / Messages not available — drop the chat quietly.
			console.warn(`[imessage] poll ${chatId} failed: ${error instanceof Error ? error.message : String(error)}`);
			return;
		}
		for (const message of messages) {
			if (this.seenIds.has(message.id)) continue;
			this.seenIds.add(message.id);
			if (this.seenIds.size > MAX_SEEN_IDS) {
				const iterator = this.seenIds.values();
				const first = iterator.next().value as string | undefined;
				if (first !== undefined) this.seenIds.delete(first);
			}
			if (message.fromMe) continue;
			const text = message.text?.trim();
			if (!text) continue;
			await this.handleIncoming(chatId, text).catch((error: unknown) => {
				console.warn(`[imessage] handle failed: ${error instanceof Error ? error.message : String(error)}`);
			});
		}
	}

	private async handleIncoming(chatId: string, text: string): Promise<void> {
		// A pending free-text answer consumes this message (bound to its chat).
		if (this.pendingTextRequest && this.pendingTextRequest.chatId === chatId) {
			const request = this.pendingTextRequest;
			this.pendingTextRequest = undefined;
			request.resolve(text);
			return;
		}

		// Confirm verdicts.
		if (this.pendingConfirms.size > 0) {
			const verdict = text.toLowerCase();
			if (/^(approve|yes|y|allow|ok|1)\b/.test(verdict) || /^(deny|no|n|block|0)\b/.test(verdict)) {
				const ok = /^(approve|yes|y|allow|ok|1)\b/.test(verdict);
				for (const [requestId, pending] of [...this.pendingConfirms.entries()]) {
					if (pending.chatId === chatId) {
						pending.resolve(ok);
						this.pendingConfirms.delete(requestId);
						return;
					}
				}
			}
		}

		// Option selections by number.
		if (this.pendingSelects.size > 0) {
			const number = Number(text.trim());
			if (Number.isInteger(number) && number >= 1) {
				for (const [requestId, pending] of [...this.pendingSelects.entries()]) {
					const index = number - 1;
					if (index < pending.options.length) {
						pending.resolve(pending.options[index]);
						this.pendingSelects.delete(requestId);
						return;
					}
				}
			}
		}

		if (text === "/status") {
			await this.sendText(chatId, this.statusText());
			return;
		}
		if (text === "/help") {
			await this.sendText(
				chatId,
				"Send any message and the agent works on the shared session (shown in the TUI too).\n\nCommands: /status · /help. Confirmations arrive as text (reply APPROVE/DENY); questions as numbered replies.",
			);
			return;
		}

		this.activeChatId = chatId;
		this.pendingMessages.push({ chatId, text });
		try {
			await this.options.prompt(text, { streamingBehavior: "followUp" });
		} catch (error) {
			const index = this.pendingMessages.findIndex((entry) => entry.text === text);
			if (index !== -1) this.pendingMessages.splice(index, 1);
			await this.sendText(
				chatId,
				`⚠️ Could not start the task: ${error instanceof Error ? error.message : String(error)}`,
			).catch(() => {});
		}
	}

	private statusText(): string {
		const status = this.options.getStatus?.() ?? "";
		return `📡 iMessage bridge: ${this.running ? "polling" : "stopped"}\n${status}`.trim();
	}

	/** Start polling allowed chats. Idempotent. */
	async start(): Promise<void> {
		if (this.running) return;
		if (process.platform !== "darwin") {
			throw new Error("iMessage bridge is macOS-only (Messages.app).");
		}
		this.running = true;
		this.pollChats = await this.resolveAllowlist(this.options.allowlist).catch(() => this.options.allowlist);
		if (this.pollChats.length === 0) {
			this.running = false;
			throw new Error("No allowed chats. Set PORCUPINE_IMESSAGE_ALLOW to chat ids or phone/email handles.");
		}
		this.pollTimer = setInterval(() => {
			for (const chatId of this.pollChats) {
				void this.pollChat(chatId).catch(() => {});
			}
		}, POLL_INTERVAL_MS);
		// Immediate first poll.
		for (const chatId of this.pollChats) {
			void this.pollChat(chatId).catch(() => {});
		}
	}

	async stop(): Promise<void> {
		this.running = false;
		if (this.pollTimer) {
			clearInterval(this.pollTimer);
			this.pollTimer = undefined;
		}
		for (const [requestId, pending] of [...this.pendingConfirms.entries()]) {
			pending.resolve(false);
			this.pendingConfirms.delete(requestId);
		}
		for (const [requestId, pending] of [...this.pendingSelects.entries()]) {
			pending.resolve(undefined);
			this.pendingSelects.delete(requestId);
		}
		if (this.pendingTextRequest) {
			this.pendingTextRequest.resolve(undefined);
			this.pendingTextRequest = undefined;
		}
	}
}
