export type RestartCommand = { kind: "restart" } | { kind: "invalid"; message: string };

const USAGE = "Usage: /restart";

/**
 * `/restart` fully exits the Node process and relaunches Porcupine, resuming
 * the current session. Unlike `/refresh` (in-process rebuild), this reloads
 * fresh code from disk.
 */
export function parseRestartCommand(text: string): RestartCommand | null {
	const match = /^\/restart(?:\s+(.*))?\s*$/i.exec(text.trim());
	if (!match) return null;
	const extra = match[1]?.trim();
	if (extra) {
		return { kind: "invalid", message: USAGE };
	}
	return { kind: "restart" };
}

/** Build argv for the replacement Porcupine process (node + entry + flags). */
export function buildRestartArgv(options: {
	/** process.argv[1] — usually dist/cli.js */
	entryPath: string;
	/** process.argv.slice(2) — the original CLI flags, preserved across restart. */
	originalArgs?: string[];
	sessionId?: string;
	sessionFile?: string;
	sessionDir?: string;
	usesDefaultSessionDir: boolean;
}): string[] {
	const args = [options.entryPath];
	// Keep the original CLI configuration (--provider, --model, --thinking,
	// --tools, --extension, --approve, ...) minus session-selection flags,
	// which are re-appended explicitly below so the resumed session stays
	// stable. Without this, /restart silently dropped all other CLI config.
	const valueFlags = new Set(["--session", "--session-file", "--session-dir", "--resume"]);
	for (const original of options.originalArgs ?? []) {
		const flag = original.split("=", 1)[0]!;
		if (valueFlags.has(flag)) continue;
		if (flag.startsWith("--session-dir=") || flag.startsWith("--session=")) continue;
		args.push(original);
	}
	if (!options.usesDefaultSessionDir && options.sessionDir) {
		args.push("--session-dir", options.sessionDir);
	}
	// Prefer stable session id; fall back to explicit file path.
	if (options.sessionId) {
		args.push("--session", options.sessionId);
	} else if (options.sessionFile) {
		args.push("--session", options.sessionFile);
	}
	return args;
}
