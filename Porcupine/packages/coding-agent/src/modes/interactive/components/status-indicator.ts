import { type Component, Loader, type TUI } from "@porcupineai/tui";
import type { WorkingIndicatorOptions } from "../../../core/extensions/index.ts";
import { theme } from "../theme/theme.ts";
import { CountdownTimer } from "./countdown-timer.ts";
import { keyText } from "./keybinding-hints.ts";

export type StatusIndicatorKind = "working" | "retry" | "compaction" | "branchSummary";

export class StatusIndicator extends Loader {
	readonly kind: StatusIndicatorKind;

	constructor(
		kind: StatusIndicatorKind,
		ui: TUI,
		spinnerColorFn: (str: string) => string,
		messageColorFn: (str: string) => string,
		message: string,
		indicator?: WorkingIndicatorOptions,
	) {
		super(ui, spinnerColorFn, messageColorFn, message, indicator);
		this.kind = kind;
	}

	dispose(): void {
		this.stop();
	}
}

export class WorkingStatusIndicator extends StatusIndicator {
	constructor(ui: TUI, message: string, indicator?: WorkingIndicatorOptions) {
		super(
			"working",
			ui,
			(spinner) => theme.fg("accent", spinner),
			(text) => theme.fg("muted", text),
			message,
			indicator,
		);
	}
}

export class RetryStatusIndicator extends StatusIndicator {
	private countdown: CountdownTimer | undefined;
	private onExpire: (() => void) | undefined;

	constructor(ui: TUI, attempt: number, maxAttempts: number, delayMs: number, onExpire?: () => void) {
		const retryMessage = (seconds: number) =>
			`Retrying (${attempt}/${maxAttempts}) in ${seconds}s... (${keyText("app.interrupt")} to cancel)`;
		super(
			"retry",
			ui,
			(spinner) => theme.fg("warning", spinner),
			(text) => theme.fg("muted", text),
			retryMessage(Math.ceil(delayMs / 1000)),
		);
		this.onExpire = onExpire;
		this.countdown = new CountdownTimer(
			delayMs,
			ui,
			(seconds) => {
				this.setMessage(retryMessage(seconds));
			},
			() => {
				// Expiry must dismiss the indicator itself — otherwise a stale
				// "Retrying (n/N) in 0s" spinner persists until an external
				// auto_retry_end event happens to clear it.
				this.countdown = undefined;
				this.dispose();
				this.onExpire?.();
			},
		);
	}

	override dispose(): void {
		this.countdown?.dispose();
		this.countdown = undefined;
		super.dispose();
	}
}

export type CompactionStatusReason = "manual" | "threshold" | "overflow";

export class CompactionStatusIndicator extends StatusIndicator {
	constructor(ui: TUI, reason: CompactionStatusReason) {
		const cancelHint = `(${keyText("app.interrupt")} to cancel)`;
		const frames =
			reason === "manual"
				? [
						"(🗜️) Compacting context.",
						"(🗜️) Compacting context..",
						"(🗜️) Compacting context...",
						"(🗜️) Compacting context..",
					]
				: reason === "overflow"
					? [
							"(🗜️) Context overflow, compacting.",
							"(🗜️) Context overflow, compacting..",
							"(🗜️) Context overflow, compacting...",
							"(🗜️) Context overflow, compacting..",
						]
					: ["(🗜️) Auto-compacting.", "(🗜️) Auto-compacting..", "(🗜️) Auto-compacting...", "(🗜️) Auto-compacting.."];
		super(
			"compaction",
			ui,
			(spinner) => theme.fg("accent", spinner),
			(text) => theme.fg("muted", text),
			cancelHint,
			{ frames, intervalMs: 320 },
		);
	}
}

export class BranchSummaryStatusIndicator extends StatusIndicator {
	constructor(ui: TUI) {
		super(
			"branchSummary",
			ui,
			(spinner) => theme.fg("accent", spinner),
			(text) => theme.fg("muted", text),
			`(${keyText("app.interrupt")} to cancel)`,
			{
				frames: [
					"(🧩) Connecting pieces.",
					"(🧩) Connecting pieces..",
					"(🧩) Connecting pieces...",
					"(🧩) Connecting pieces..",
				],
				intervalMs: 320,
			},
		);
	}
}

export class IdleStatus implements Component {
	invalidate(): void {
		// No cached state to invalidate.
	}

	render(width: number): string[] {
		const emptyLine = " ".repeat(width);
		return [emptyLine, emptyLine];
	}
}
