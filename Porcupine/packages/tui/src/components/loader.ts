import type { TUI } from "../tui.ts";
import { Text } from "./text.ts";

export interface LoaderIndicatorOptions {
	/** Animation frames. Use an empty array to hide the indicator. */
	frames?: string[];
	/** Frame interval in milliseconds for animated indicators. */
	intervalMs?: number;
	/**
	 * When true, frames are shown as-is (no spinner color). Use for pre-colored ANSI.
	 * Default false so theme accent still applies to braille/emoji glyphs.
	 */
	verbatim?: boolean;
}

const DEFAULT_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const DEFAULT_INTERVAL_MS = 80;

/**
 * Loader component that updates with an optional spinning animation.
 */
export class Loader extends Text {
	private frames = [...DEFAULT_FRAMES];
	private intervalMs = DEFAULT_INTERVAL_MS;
	private currentFrame = 0;
	private intervalId: NodeJS.Timeout | null = null;
	private ui: TUI | null = null;
	private renderIndicatorVerbatim = false;
	private spinnerColorFn: (str: string) => string;
	private messageColorFn: (str: string) => string;
	private message: string = "Loading...";

	constructor(
		ui: TUI,
		spinnerColorFn: (str: string) => string,
		messageColorFn: (str: string) => string,
		message: string = "Loading...",
		indicator?: LoaderIndicatorOptions,
	) {
		super("", 1, 0);
		this.ui = ui;
		this.spinnerColorFn = spinnerColorFn;
		this.messageColorFn = messageColorFn;
		this.message = message;
		this.setIndicator(indicator);
	}

	render(width: number): string[] {
		return ["", ...super.render(width)];
	}

	start(): void {
		this.updateDisplay();
		this.restartAnimation();
	}

	stop(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	/**
	 * Release the loader for teardown: clear the animation interval and drop the
	 * reference to the TUI so no further re-renders are requested after disposal.
	 * Idempotent; safe to call on abnormal exit or overlay hide.
	 */
	dispose(): void {
		this.stop();
		this.ui = null;
	}

	setMessage(message: string): void {
		this.message = message;
		this.updateDisplay();
	}

	setIndicator(indicator?: LoaderIndicatorOptions): void {
		// Only skip theme coloring when explicitly requested. Passing custom frames
		// used to force verbatim=true, which made Working/Thinking braille spinners
		// render in the default fg (often invisible against the theme).
		const nextVerbatim = indicator?.verbatim === true;
		const nextFrames = indicator?.frames !== undefined ? [...indicator.frames] : [...DEFAULT_FRAMES];
		const nextInterval =
			indicator?.intervalMs && indicator.intervalMs > 0 ? indicator.intervalMs : DEFAULT_INTERVAL_MS;

		// Avoid restarting the timer when callers re-apply the same frames (common when
		// streaming status updates keep the same activity phase). Restarting would pin
		// the animation on frame 0 and make spinners/dots appear frozen.
		const unchanged =
			nextVerbatim === this.renderIndicatorVerbatim &&
			nextInterval === this.intervalMs &&
			nextFrames.length === this.frames.length &&
			nextFrames.every((frame, index) => frame === this.frames[index]);
		if (unchanged) {
			this.updateDisplay();
			if (!this.intervalId && this.frames.length > 1) {
				this.restartAnimation();
			}
			return;
		}

		this.renderIndicatorVerbatim = nextVerbatim;
		this.frames = nextFrames;
		this.intervalMs = nextInterval;
		this.currentFrame = 0;
		this.start();
	}

	private restartAnimation(): void {
		this.stop();
		if (this.frames.length <= 1) {
			return;
		}
		this.intervalId = setInterval(() => {
			this.currentFrame = (this.currentFrame + 1) % this.frames.length;
			this.updateDisplay();
		}, this.intervalMs);
	}

	private updateDisplay(): void {
		const frame = this.frames[this.currentFrame] ?? "";
		const renderedFrame = this.renderIndicatorVerbatim ? frame : this.spinnerColorFn(frame);
		const indicator = frame.length > 0 ? `${renderedFrame} ` : "";
		this.setText(`${indicator}${this.messageColorFn(this.message)}`);
		if (this.ui) {
			this.ui.requestRender();
		}
	}
}
