/**
 * Playback of WAV audio using the platform's built-in player
 * (afplay on macOS, paplay/aplay on Linux, PowerShell on Windows).
 */

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** True when a system audio player is available for this platform. */
export function hasPlayer(): boolean {
	return process.platform === "darwin" || process.platform === "linux" || process.platform === "win32";
}

function playCommand(file: string): { cmd: string; args: string[] } {
	switch (process.platform) {
		case "darwin":
			return { cmd: "afplay", args: [file] };
		case "linux":
			return { cmd: "paplay", args: [file] };
		case "win32":
			return {
				cmd: "powershell",
				args: ["-NoProfile", "-Command", `(New-Object Media.SoundPlayer '${file}').PlaySync()`],
			};
		default:
			throw new Error(`Audio playback is not supported on ${process.platform}`);
	}
}

/** Cap on playback time so a hung player can never disable TTS forever. */
const PLAYBACK_TIMEOUT_MS = 15000;

/** Play a WAV buffer. Resolves when playback finishes (or fails or times out). */
export function playWav(buffer: Buffer): Promise<void> {
	return new Promise((resolve) => {
		const dir = mkdtempSync(join(tmpdir(), "porcupine-speak-"));
		const file = join(dir, "speech.wav");
		writeFileSync(file, buffer);
		const { cmd, args } = playCommand(file);
		const proc = spawn(cmd, args, { stdio: "ignore" });
		let settled = false;
		const cleanup = () => rmSync(dir, { recursive: true, force: true });
		const settle = () => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			cleanup();
			resolve();
		};
		proc.on("error", settle);
		proc.on("close", settle);
		// A hung player (afplay/paplay/PowerShell) could otherwise leave speak()
		// awaiting forever; force-kill and resolve after the cap.
		const timer = setTimeout(() => {
			if (settled) return;
			if (proc.exitCode === null) {
				proc.kill("SIGKILL");
			}
			settle();
		}, PLAYBACK_TIMEOUT_MS);
	});
}
