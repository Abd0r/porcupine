/**
 * Sub-agent message bus (WoT: agents talk to each other).
 *
 * Enables peer-to-peer messaging between background sub-agents — but ONLY when
 * the main agent decides: a sub-agent is given a `peerGroup` at spawn time, and
 * only sub-agents sharing that group receive the send/check messaging tools.
 * Everything is routed through this in-memory bus, so the main agent can also
 * inspect the whole conversation (transparency over opaque side channels).
 */

import { randomUUID } from "node:crypto";

export interface PeerMessage {
	id: string;
	from: string;
	to: string;
	text: string;
	at: string;
}

export type PeerSendResult = { ok: true; message: PeerMessage } | { ok: false; error: string };

export interface SubagentMessageBusHooks {
	/**
	 * Called for sub→sub sends so the session can deliver LIVE (steer into the
	 * target's running context). Return true when delivered — the message is then
	 * not queued in the target's inbox (no double delivery via check_messages).
	 */
	onDeliver?: (message: PeerMessage) => boolean;
	/** Called for sub→main sends so the session can inject instantly. */
	onMainMessage?: (message: PeerMessage) => void;
}

export class SubagentMessageBus {
	/** sub-agent id → peer group (only same-group peers can message each other). */
	private readonly members = new Map<string, string>();
	private readonly inboxes = new Map<string, PeerMessage[]>();
	private readonly mainInbox: PeerMessage[] = [];
	private readonly outbox: PeerMessage[] = [];
	/** Live-delivery hooks wired by the session (instant WoT injection). */
	private hooks: SubagentMessageBusHooks = {};

	setHooks(hooks: SubagentMessageBusHooks): void {
		this.hooks = hooks;
	}

	/** Register a sub-agent into the bus under its peer group. */
	register(id: string, peerGroup: string): void {
		this.members.set(id, peerGroup);
		if (!this.inboxes.has(id)) this.inboxes.set(id, []);
	}

	/** Remove a sub-agent when its run settles. */
	unregister(id: string): void {
		this.members.delete(id);
		this.inboxes.delete(id);
	}

	/** Whether a sub-agent is registered (messaging-enabled) on the bus. */
	isMember(id: string): boolean {
		return this.members.has(id);
	}

	/** The peer group a sub-agent belongs to, if any. */
	groupOf(id: string): string | undefined {
		return this.members.get(id);
	}

	/**
	 * Send a message from one sub-agent to another (same peer group) OR to the
	 * main agent (`to: "@main"`). Sub→main is always allowed for messaging-enabled
	 * sub-agents; sub→sub requires a shared peer group (main-agent-gated).
	 */
	send(from: string, to: string, text: string): PeerSendResult {
		const group = this.members.get(from);
		if (!group) return { ok: false, error: "this sub-agent is not messaging-enabled (no peerGroup)" };
		if (from === to) return { ok: false, error: "cannot message yourself" };
		if (!text.trim()) return { ok: false, error: "empty message" };

		const isMainTarget = to === "@main" || to === "main";
		if (!isMainTarget) {
			const targetGroup = this.members.get(to);
			if (!targetGroup) return { ok: false, error: `unknown peer: ${to}` };
			if (targetGroup !== group) return { ok: false, error: `peer ${to} is not in your peer group` };
		}

		const message: PeerMessage = {
			id: randomUUID(),
			from,
			to: isMainTarget ? "@main" : to,
			text: text.trim().slice(0, 4_000),
			at: new Date().toISOString(),
		};
		if (isMainTarget) {
			this.mainInbox.push(message);
			// Instant delivery into the main agent's context (WoT live injection).
			this.hooks.onMainMessage?.(message);
		} else {
			// Instant delivery into the peer's running context when a live steerer
			// exists; otherwise queue for check_messages.
			const deliveredLive = this.hooks.onDeliver?.(message) === true;
			if (!deliveredLive) this.inboxes.get(to)?.push(message);
		}
		this.outbox.push(message);
		return { ok: true, message };
	}

	/**
	 * Record a main→sub message (parent steering a child). The steerer already
	 * delivers it live; this keeps the audit trail complete without duplicating.
	 */
	recordMainToSub(to: string, text: string): PeerMessage {
		const message: PeerMessage = {
			id: randomUUID(),
			from: "@main",
			to,
			text: text.trim().slice(0, 4_000),
			at: new Date().toISOString(),
		};
		this.outbox.push(message);
		return message;
	}

	/** Drain (and remove) messages addressed to the main agent. */
	drainMainInbox(): PeerMessage[] {
		const drained = [...this.mainInbox];
		this.mainInbox.length = 0;
		return drained;
	}

	/** Remove a single main-inbox message once it has been injected live (dedupe). */
	markDeliveredToMain(id: string): void {
		const index = this.mainInbox.findIndex((message) => message.id === id);
		if (index >= 0) this.mainInbox.splice(index, 1);
	}

	/** Drain (and remove) a sub-agent's incoming messages. */
	drainInbox(id: string): PeerMessage[] {
		const inbox = this.inboxes.get(id);
		if (!inbox) return [];
		this.inboxes.set(id, []);
		return inbox;
	}

	/** Every message ever routed (main-agent visibility / audit). */
	allMessages(): PeerMessage[] {
		return [...this.outbox];
	}
}
