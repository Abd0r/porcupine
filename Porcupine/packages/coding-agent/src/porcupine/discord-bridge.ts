/**
 * Discord bridge for Porcupine — a bot token turns allowed Discord channels
 * into a remote control for the SAME session (mirroring the Telegram bridge
 * contract: pending-prompt provenance, TUI↔phone racing, agent_end forwarding).
 *
 * Zero dependencies: Node's built-in WebSocket (>= 22.4, also present on Bun)
 * for the gateway, fetch() for REST. Approve/Deny and option selection use
 * message reactions (✅ / ❌ / 1️⃣…), so no slash-command registration or
 * interaction callbacks are needed.
 *
 * Env:
 *   PORCUPINE_DISCORD_TOKEN  — bot token
 *   PORCUPINE_DISCORD_ALLOW  — comma-separated channel ids allowed to talk
 */

import { randomUUID } from "node:crypto";
import type { AgentMessage } from "@porcupineai/agent-core";
import { extractAssistantText, lastUserMessageText, summarizeToolCalls, textsMatch } from "./telegram-bridge.ts";

const GATEWAY_URL = "wss://gateway.discord.gg/?v=10&encoding=json";
const REST_BASE = "https://discord.com/api/v10";
const CHUNK = 2000;

// Gateway intents: guild messages, guild message reactions, direct messages,
// direct message reactions, message content.
const INTENTS = (1 << 9) | (1 << 10) | (1 << 12) | (1 << 13) | (1 << 15);

const NUMBER_EMOJI = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"] as const;

/** Minimal shape of the global WebSocket (typed locally; @types/node has no DOM lib). */
interface GatewaySocket {
	onopen: (() => void) | null;
	onmessage: ((event: { data: unknown }) => void) | null;
	onclose: ((event: { code: number; reason: string }) => void) | null;
	onerror: ((event: unknown) => void) | null;
	send(data: string): void;
	close(code?: number, reason?: string): void;
}

interface DiscordGatewayPayload {
	op: number;
	d?: unknown;
	s?: number | null;
	t?: string | null;
}

interface DiscordMessage {
	id: string;
	channel_id: string;
	author?: { id: string; bot?: boolean };
	content?: string;
}

interface DiscordReaction {
	user_id: string;
	message_id: string;
	channel_id: string;
	emoji?: { name?: string };
}

export interface DiscordBridgeOptions {
	token: string;
	/** Channel ids (PORCUPINE_DISCORD_ALLOW) that may drive the session. */
	allowlist: string[];
	prompt: (text: string, options?: { streamingBehavior?: "followUp" | "steer" }) => Promise<void>;
	getStatus?: () => string;
	dialogTimeoutMs?: number;
	confirmTimeoutMs?: number;
}

export class DiscordBridge {
	private readonly options: DiscordBridgeOptions;
	private running = false;
	private ws: GatewaySocket | undefined;
	private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
	private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
	private reconnectAttempts = 0;
	private sequence: number | null = null;
	private sessionId: string | undefined;
	private selfId: string | undefined;
	private heartbeatIntervalMs = 0;
	private heartbeatWithSeq = false;

	/** Discord-originated prompts awaiting their response turn (provenance match). */
	private pendingDiscord: Array<{ channelId: string; text: string }> = [];
	/** Most recent channel that sent a real prompt; confirmations go there. */
	private activeChannelId: string | undefined;
	/** Approve/Deny waiters keyed by confirm request id (stale-proof). */
	private confirmWaiters = new Map<string, (ok: boolean) => void>();
	/** ask_question option selections by request id. */
	private pendingSelects = new Map<string, { options: string[]; resolve: (value: string | undefined) => void }>();
	/** ask_question free-text answer bound to one channel. */
	private pendingTextRequest: { channelId: string; resolve: (value: string | undefined) => void } | undefined;

	constructor(options: DiscordBridgeOptions) {
		this.options = options;
	}

	get isRunning(): boolean {
		return this.running;
	}

	get pendingTurns(): number {
		return this.pendingDiscord.length;
	}

	// ---------------------------------------------------------------------
	// REST
	// ---------------------------------------------------------------------

	private async rest(path: string, init?: RequestInit): Promise<unknown> {
		const response = await fetch(`${REST_BASE}${path}`, {
			...init,
			headers: {
				authorization: `Bot ${this.options.token}`,
				"content-type": "application/json",
				...init?.headers,
			},
			signal: AbortSignal.timeout(30_000),
		});
		if (response.status === 429) {
			const retryAfter = Number((response.headers.get("retry-after") ?? "1") || 1);
			await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000 + 250));
			return this.rest(path, init);
		}
		if (!response.ok) {
			const body = await response.text().catch(() => "");
			throw new Error(`Discord REST ${response.status} ${path}: ${body.slice(0, 300)}`);
		}
		if (response.status === 204) return undefined;
		return response.json() as Promise<unknown>;
	}

	/** Send an outbound notification to the most recently active channel (if any). Attended-only; silently skipped when no channel has prompted yet. */
	async notifyTaskResult(text: string): Promise<void> {
		if (!text || this.activeChannelId === undefined) return;
		await this.sendText(this.activeChannelId, text).catch(() => {});
	}

	async sendText(channelId: string, text: string): Promise<string | undefined> {
		if (!text) return undefined;
		let lastId: string | undefined;
		for (let i = 0; i < text.length; i += CHUNK) {
			const result = await this.rest(`/channels/${channelId}/messages`, {
				method: "POST",
				body: JSON.stringify({ content: text.slice(i, i + CHUNK) }),
			}).catch((error: unknown) => {
				console.warn(`[discord] send failed: ${error instanceof Error ? error.message : String(error)}`);
				return undefined;
			});
			if (result && typeof result === "object") {
				const id = (result as { id?: unknown }).id;
				if (typeof id === "string") lastId = id;
			}
		}
		return lastId;
	}

	private async addReaction(channelId: string, messageId: string, emoji: string): Promise<void> {
		await this.rest(`/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`, {
			method: "PUT",
		}).catch(() => {});
	}

	// ---------------------------------------------------------------------
	// Confirmation / selection / input (same contract as Telegram)
	// ---------------------------------------------------------------------

	/** Remote-only confirm (no TUI): Approve/Deny reactions on the active channel. */
	remoteConfirm(title: string, message: string): Promise<boolean> | undefined {
		const channelId = this.activeChannelId;
		if (channelId === undefined) return undefined;
		return new Promise<boolean>((resolve) => {
			const requestId = randomUUID();
			const waiter = (ok: boolean) => {
				this.confirmWaiters.delete(requestId);
				resolve(ok);
			};
			this.confirmWaiters.set(requestId, waiter);
			const timeout = this.options.confirmTimeoutMs ?? 5 * 60 * 1000;
			setTimeout(() => waiter(false), timeout);
			void this.sendText(channelId, `❓ ${title}\n\n${message}\n\nReact ✅ to approve, ❌ to deny.`).then(
				(messageId) => {
					if (messageId && this.confirmWaiters.has(requestId)) {
						void this.addReaction(channelId, messageId, "✅");
						void this.addReaction(channelId, messageId, "❌");
					}
				},
				() => waiter(false),
			);
		});
	}

	/** ask_question options: numbered reactions race the TUI selector. */
	async select(
		title: string,
		options: string[],
		tui: (title: string, options: string[]) => Promise<string | undefined>,
		opts?: { signal?: AbortSignal },
	): Promise<string | undefined> {
		const channelId = this.activeChannelId;
		const tuiPromise = tui(title, options);
		if (channelId === undefined || options.length === 0) return tuiPromise;
		if (options.length > NUMBER_EMOJI.length) return tuiPromise;

		const requestId = randomUUID();
		const numbered = options.map((option, index) => `${NUMBER_EMOJI[index]} ${option}`).join("\n");
		await this.sendText(channelId, `❓ ${title}\n\n${numbered}\n\nReact with a number.`).catch(() => {});

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

	/** ask_question free text: the next message from the same channel answers it. */
	async input(
		title: string,
		tui: (title: string) => Promise<string | undefined>,
		opts?: { signal?: AbortSignal },
	): Promise<string | undefined> {
		const channelId = this.activeChannelId;
		const tuiPromise = tui(title);
		if (channelId === undefined) return tuiPromise;
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
			this.pendingTextRequest = { channelId, resolve: finish };
			opts?.signal?.addEventListener("abort", () => finish(undefined), { once: true });
			void tuiPromise.then((value) => finish(value));
		});
		await this.sendText(channelId, `⌨️ ${title}\n\nReply with your answer.`).catch(() => {});
		return pending;
	}

	// ---------------------------------------------------------------------
	// Session events
	// ---------------------------------------------------------------------

	/** Forward the terminal response to the channel that started the turn. */
	async handleAgentEnd(messages: readonly AgentMessage[], willRetry: boolean): Promise<void> {
		if (willRetry) return;
		const lastUserText = lastUserMessageText(messages);
		const index = this.pendingDiscord.findIndex(
			(entry) => lastUserText !== undefined && textsMatch(entry.text, lastUserText),
		);
		if (index === -1) return;
		const entry = this.pendingDiscord[index]!;
		this.pendingDiscord.splice(index, 1);
		try {
			const raw = extractAssistantText(messages);
			const tools = summarizeToolCalls(messages);
			const body = [raw, tools ? `\n${tools}` : ""].join("").trim();
			await this.sendText(entry.channelId, body || "Done.");
		} catch (error) {
			console.warn(
				`[discord] failed to forward response: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	// ---------------------------------------------------------------------
	// Gateway
	// ---------------------------------------------------------------------

	private wsSocket(): GatewaySocket | undefined {
		return this.ws;
	}

	private connect(): void {
		if (!this.running) return;
		const WebSocketCtor = (globalThis as { WebSocket?: new (url: string) => unknown }).WebSocket;
		if (!WebSocketCtor) {
			console.warn("[discord] WebSocket is not available in this runtime (needs Node >= 22.4 or Bun).");
			this.running = false;
			return;
		}
		const ws = new WebSocketCtor(GATEWAY_URL) as unknown as GatewaySocket;
		this.ws = ws;

		ws.onopen = () => {
			this.reconnectAttempts = 0;
			this.sendGateway({ op: 2, d: this.identifyPayload() });
		};
		ws.onmessage = (event) => {
			if (typeof event.data !== "string") return;
			try {
				const payload = JSON.parse(event.data) as DiscordGatewayPayload;
				this.sequence = payload.s ?? this.sequence;
				void this.handlePayload(payload);
			} catch (error) {
				console.warn(`[discord] bad gateway payload: ${error instanceof Error ? error.message : String(error)}`);
			}
		};
		ws.onclose = () => {
			this.stopHeartbeat();
			if (this.running) this.scheduleReconnect();
		};
		ws.onerror = () => {
			// close follows; handled in onclose
		};
	}

	private identifyPayload(): Record<string, unknown> {
		return {
			token: this.options.token,
			intents: INTENTS,
			properties: { os: process.platform, browser: "porcupine", device: "porcupine" },
			presence: {
				status: "online",
				activities: [{ name: "Porcupine agent bridge", type: 3 }],
				afk: false,
			},
		};
	}

	private sendGateway(payload: Record<string, unknown>): void {
		this.wsSocket()?.send(JSON.stringify(payload));
	}

	private stopHeartbeat(): void {
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = undefined;
		}
	}

	private scheduleReconnect(): void {
		if (this.reconnectTimer) return;
		const delay = Math.min(30_000, 1000 * 2 ** this.reconnectAttempts);
		this.reconnectAttempts++;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = undefined;
			if (!this.running) return;
			if (this.sessionId && this.sequence !== null) {
				// Resume before re-identifying so the bot keeps its session.
				this.connect();
			} else {
				this.connect();
			}
		}, delay);
	}

	private async handlePayload(payload: DiscordGatewayPayload): Promise<void> {
		switch (payload.op) {
			case 10: {
				const hello = payload.d as { heartbeat_interval: number } | undefined;
				this.heartbeatIntervalMs = hello?.heartbeat_interval ?? 41_250;
				this.heartbeatWithSeq = false;
				this.stopHeartbeat();
				this.heartbeatTimer = setInterval(() => {
					this.sendGateway({ op: 1, d: this.heartbeatWithSeq ? this.sequence : null });
				}, this.heartbeatIntervalMs);
				break;
			}
			case 11:
				// HEARTBEAT_ACK — subsequent heartbeats carry the sequence for resume.
				this.heartbeatWithSeq = true;
				break;
			case 7:
				// Server requests a reconnect.
				this.wsSocket()?.close(4000);
				break;
			case 0:
				await this.handleDispatch(payload);
				break;
		}
	}

	private async handleDispatch(payload: DiscordGatewayPayload): Promise<void> {
		const eventName = payload.t;
		const data = payload.d as Record<string, unknown> | undefined;
		switch (eventName) {
			case "READY": {
				const ready = data as { session_id?: string; user?: { id?: string } } | undefined;
				this.sessionId = ready?.session_id;
				this.selfId = ready?.user?.id;
				break;
			}
			case "RESUMED":
				break;
			case "MESSAGE_CREATE":
				await this.handleMessage(data as unknown as DiscordMessage);
				break;
			case "MESSAGE_REACTION_ADD":
				await this.handleReaction(data as unknown as DiscordReaction);
				break;
		}
	}

	private isAllowed(channelId: string): boolean {
		return this.options.allowlist.includes(channelId);
	}

	private async handleMessage(message: DiscordMessage): Promise<void> {
		if (message.author?.id === this.selfId || message.author?.bot) return;
		const channelId = message.channel_id;
		if (!this.isAllowed(channelId)) return;
		const text = message.content?.trim();
		if (!text) return;

		// A pending free-text answer consumes this message (bound to its channel).
		if (this.pendingTextRequest && this.pendingTextRequest.channelId === channelId) {
			const request = this.pendingTextRequest;
			this.pendingTextRequest = undefined;
			request.resolve(text);
			return;
		}

		if (text === "/status") {
			await this.sendText(channelId, this.statusText());
			return;
		}
		if (text === "/help") {
			await this.sendText(
				channelId,
				"Send any message and the agent works on the shared session (shown in the TUI too).\n\nCommands: /status · /help. Ask-mode confirmations arrive as ✅/❌ reactions; questions as numbered reactions.",
			);
			return;
		}

		this.activeChannelId = channelId;
		this.pendingDiscord.push({ channelId, text });
		try {
			await this.options.prompt(text, { streamingBehavior: "followUp" });
		} catch (error) {
			const index = this.pendingDiscord.findIndex((entry) => entry.text === text);
			if (index !== -1) this.pendingDiscord.splice(index, 1);
			await this.sendText(
				channelId,
				`⚠️ Could not start the task: ${error instanceof Error ? error.message : String(error)}`,
			).catch(() => {});
		}
	}

	private async handleReaction(reaction: DiscordReaction): Promise<void> {
		if (reaction.user_id === this.selfId) return;
		if (!this.isAllowed(reaction.channel_id)) return;
		const emoji = reaction.emoji?.name;

		// Resolve an active option selection by reaction number.
		if (emoji) {
			const selectIndex = NUMBER_EMOJI.indexOf(emoji as (typeof NUMBER_EMOJI)[number]);
			if (selectIndex >= 0) {
				for (const [requestId, pending] of [...this.pendingSelects.entries()]) {
					if (selectIndex < pending.options.length) {
						pending.resolve(pending.options[selectIndex]);
						this.pendingSelects.delete(requestId);
						return;
					}
				}
			}
		}

		// Approve/Deny: message id scopes the waiter (stale reaction can't hit a new confirm).
		if (emoji === "✅" || emoji === "❌") {
			for (const [requestId, waiter] of [...this.confirmWaiters.entries()]) {
				void requestId;
				waiter(emoji === "✅");
				this.confirmWaiters.delete(requestId);
				return;
			}
		}
	}

	private statusText(): string {
		const status = this.options.getStatus?.() ?? "";
		return `📡 Discord bridge: ${this.running ? "connected" : "stopped"}\n${status}`.trim();
	}

	/** Start the gateway. Idempotent. */
	async start(): Promise<void> {
		if (this.running) return;
		this.running = true;
		this.connect();
	}

	async stop(): Promise<void> {
		this.running = false;
		this.stopHeartbeat();
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = undefined;
		}
		this.wsSocket()?.close(1000);
		this.ws = undefined;
	}
}
