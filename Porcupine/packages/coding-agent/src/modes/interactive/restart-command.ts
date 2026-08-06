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
	sessionId?: string;
	sessionFile?: string;
	sessionDir?: string;
	usesDefaultSessionDir: boolean;
}): string[] {
	const args = [options.entryPath];
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
