/**
 * Console interceptor for the interactive TUI.
 *
 * Porcupine runs in a full-screen alt-screen TUI. Background chat bridges
 * (Telegram / Discord / iMessage) and library code call `console.warn` /
 * `console.error` directly, which writes raw to `process.stderr` and corrupts
 * the rendered terminal frame while the TUI is up (most visibly during
 * `/refresh`, where a bridge's WS reconnect/heartbeat churn fires warnings
 * under the locked refresh banner).
 *
 * While the interactive mode is active it installs this guard: it swaps the
 * global `console.warn` / `console.error` methods so background writes are
 * buffered instead of hitting the raw stderr frame. On uninstall the originals
 * are restored and any buffered messages are flushed to `process.stderr` (safe
 * once the TUI is being torn down / rebuilt), so nothing is lost.
 */

const ORIGINAL_METHODS = new Map<"warn" | "error", (...args: unknown[]) => void>();
let buffer: Array<[string, unknown[]]> = [];
let installed = false;

function format(level: string, args: unknown[]): string {
	return `[console:${level}] ${args
		.map((arg) => {
			if (typeof arg === "string") return arg;
			if (arg instanceof Error) return arg.stack ?? arg.message;
			try {
				return JSON.stringify(arg);
			} catch {
				return String(arg);
			}
		})
		.join(" ")}`;
}

/**
 * Install the console guard, buffering `console.warn` / `console.error` writes
 * so they do not corrupt the active TUI frame. Safe to call multiple times; a
 * guard is only installed once and other callers share the same buffer.
 */
export function installConsoleGuard(): void {
	if (installed) {
		return;
	}
	const record = (level: "warn" | "error", args: unknown[]) => {
		buffer.push([level, args]);
	};
	const wrappedWarn = (...args: unknown[]) => record("warn", args);
	const wrappedError = (...args: unknown[]) => record("error", args);
	ORIGINAL_METHODS.set("warn", console.warn);
	ORIGINAL_METHODS.set("error", console.error);
	console.warn = wrappedWarn as typeof console.warn;
	console.error = wrappedError as typeof console.error;
	installed = true;
}

/** Whether the console guard is currently intercepting `console.warn`/`error`. */
export function isConsoleGuardInstalled(): boolean {
	return installed;
}

/**
 * Restore the original `console.warn` / `console.error` and flush any buffered
 * writes to `process.stderr`. Buffered messages are only played back once the
 * guard is no longer protecting a live TUI frame.
 */
export function uninstallConsoleGuard(): void {
	if (!installed) {
		return;
	}
	console.warn = ORIGINAL_METHODS.get("warn") ?? console.warn;
	console.error = ORIGINAL_METHODS.get("error") ?? console.error;
	ORIGINAL_METHODS.clear();
	for (const [level, args] of buffer) {
		process.stderr.write(`${format(level, args)}\n`);
	}
	buffer = [];
	installed = false;
}

/** Drain buffered messages as strings without restoring the guard. */
export function drainConsoleGuard(): string[] {
	const drained = buffer.map(([level, args]) => format(level, args));
	buffer = [];
	return drained;
}
