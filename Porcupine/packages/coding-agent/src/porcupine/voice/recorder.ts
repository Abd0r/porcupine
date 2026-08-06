/**
 * Microphone capture via ffmpeg (16 kHz mono WAV to a temp file).
 * ffmpeg is a system dependency — failures surface with its stderr so the
 * user can diagnose (mic permission, device index, missing binary).
 */

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeWavToFloat32 } from "./wav.ts";

const require = createRequire(import.meta.url);

export interface Recorder {
	/** Stop recording and resolve with the final WAV bytes. */
	stop: () => Promise<Buffer>;
	/** Abort without producing audio. */
	cancel: () => void;
}

function micInputArgs(): string[] {
	switch (process.platform) {
		case "darwin":
			return ["-f", "avfoundation", "-i", ":0"];
		case "linux":
			return ["-f", "alsa", "-i", "default"];
		case "win32":
			return ["-f", "dshow", "-i", "audio=Microphone"];
		default:
			throw new Error(`Voice recording is not supported on ${process.platform}`);
	}
}

/** Cache the working device so we don't re-probe on every recording. */
let cachedMicIndex: number | undefined;
let cachedMicName: string | undefined;

/** Enumerate audio devices via ffmpeg -list_devices (may truncate if slow). */
function enumerateAudioDevices(timeoutMs: number): Array<{ index: number; name: string }> {
	if (process.platform !== "darwin") return [];
	try {
		const { spawnSync } = require("node:child_process") as typeof import("node:child_process");
		const result = spawnSync("ffmpeg", ["-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""], {
			encoding: "utf8",
			timeout: timeoutMs,
		});
		const stderr = result.stderr ?? "";
		const lines = stderr.split("\n");
		const audioSection = lines.findIndex((line) => line.includes("AVFoundation audio devices"));
		if (audioSection < 0) return [];
		const devices: Array<{ index: number; name: string }> = [];
		for (const line of lines.slice(audioSection + 1)) {
			// Lines look like: "[AVFoundation indev @ 0x...] [0] BlackHole 2ch"
			const match = /\] \[(\d+)\] (.+?)\s*$/.exec(line);
			if (match) {
				devices.push({ index: Number(match[1]), name: match[2]!.trim() });
			} else if (line.trim() && !line.includes("devices:")) {
				break; // reached the end of the audio list
			}
		}
		return devices;
	} catch {
		return [];
	}
}

const isVirtualDevice = /blackhole|soundflower|loopback|background ?music|virtual|aggregate|multi-output/i;

/** 1s probe — true when the device actually OPENS and produces a WAV.
 * Deliberately does NOT require audible sound: a quiet room (or a moment of
 * silence) must not reject a real mic — that used to fall back to the virtual
 * loopback and record silence. "Opens" is the permission/device gate. */
function deviceOpens(index: number): boolean {
	try {
		const { spawnSync } = require("node:child_process") as typeof import("node:child_process");
		const { existsSync, unlinkSync } = require("node:fs") as typeof import("node:fs");
		const file = join(tmpdir(), `porcupine-micprobe-${process.pid}-${index}.wav`);
		try {
			unlinkSync(file);
		} catch {
			/* noop */
		}
		spawnSync(
			"ffmpeg",
			[
				"-hide_banner",
				"-loglevel",
				"error",
				"-y",
				"-f",
				"avfoundation",
				"-i",
				`:${index}`,
				"-ac",
				"1",
				"-ar",
				"16000",
				"-t",
				"1",
				"-f",
				"wav",
				file,
			],
			{ timeout: 4000 },
		);
		if (!existsSync(file)) return false;
		try {
			unlinkSync(file);
		} catch {
			/* noop */
		}
		return true;
	} catch {
		return false;
	}
}

/**
 * Resolve the best working microphone (cached). Tries enumeration first, then
 * raw indices with a real capture test. This handles the case where
 * -list_devices TRUNCATES (iPhone/Continuity devices make the probe exceed the
 * timeout) — the old code then fell back to device 0 (BlackHole), which
 * captures system audio instead of the mic → recorded silence.
 */
export function resolveMacMicIndex(explicitIndex?: number): number {
	if (explicitIndex !== undefined && Number.isInteger(explicitIndex) && explicitIndex >= 0) {
		return explicitIndex;
	}
	if (cachedMicIndex !== undefined) return cachedMicIndex;
	const devices = enumerateAudioDevices(1500);
	const isMic = /microphone|mic|built-?in|internal/i;
	// Prefer real, non-virtual mics from the enumeration, then any non-virtual.
	const candidates = devices
		.filter((d) => isMic.test(d.name) && !isVirtualDevice.test(d.name))
		.concat(devices.filter((d) => !isVirtualDevice.test(d.name)));
	// Verify each candidate actually captures sound — the iPhone/Continuity
	// devices exist in the list but often return no audio.
	for (const device of candidates) {
		if (deviceOpens(device.index)) {
			cachedMicIndex = device.index;
			cachedMicName = device.name;
			return device.index;
		}
	}
	// Enumeration truncated or all candidates silent: probe raw indices,
	// skipping 0 (virtual loopbacks like BlackHole sit at 0 by convention).
	for (let index = 1; index <= 6; index++) {
		if (deviceOpens(index)) {
			cachedMicIndex = index;
			return index;
		}
	}
	// Nothing captured sound: report 0; the capture itself will surface the
	// permission/device error via the silence message.
	cachedMicIndex = 0;
	return 0;
}

/** Resolve the display name for a device index (for status lines). */
export function getDeviceName(index: number): string {
	if (cachedMicName !== undefined && cachedMicIndex === index) return cachedMicName;
	const devices = enumerateAudioDevices(1500);
	const found = devices.find((d) => d.index === index);
	return found?.name ?? `device ${index}`;
}

/** True when the platform can record (ffmpeg is verified lazily on start). */
export function hasRecorder(): boolean {
	return process.platform === "darwin" || process.platform === "linux" || process.platform === "win32";
}

/** Last useful line of ffmpeg's stderr for diagnostics. */
function summarizeFfmpegError(stderr: string): string {
	const lines = stderr
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i]!;
		if (/error|fail|could not|no such|permission|denied|not found/i.test(line)) {
			return line;
		}
	}
	return lines.slice(-2).join("; ");
}

/** True when a WAV's peak amplitude is essentially zero (macOS returns zeros
 * for apps without Microphone permission, or a muted/busy mic). */
function isSilentWav(wav: Buffer): boolean {
	try {
		const pcm = decodeWavToFloat32(wav);
		let peak = 0;
		for (let i = 0; i < pcm.length; i++) {
			const abs = Math.abs(pcm[i] ?? 0);
			if (abs > peak) peak = abs;
		}
		return peak < 0.0015;
	} catch {
		return false;
	}
}

/**
 * Start recording from the default microphone. Call stop() to finalize.
 * Uses a temp file so ffmpeg writes a valid WAV header on clean exit.
 * Early failures (missing binary, mic permission/device) are reported through
 * onError when they happen, and stop() rejects with a diagnostic instead of
 * ever throwing uncaught. stop() never hangs: if ffmpeg already exited or does
 * not exit on SIGTERM, it resolves/rejects promptly.
 */
export function startRecording(onError?: (message: string) => void, inputDevice?: number): Recorder {
	const dir = mkdtempSync(join(tmpdir(), "porcupine-voice-"));
	const file = join(dir, "capture.wav");
	const inputArgs =
		process.platform === "darwin"
			? ["-f", "avfoundation", "-i", `:${resolveMacMicIndex(inputDevice)}`]
			: micInputArgs();
	const args = [
		"-hide_banner",
		"-loglevel",
		"error",
		"-y",
		...inputArgs,
		"-ac",
		"1",
		"-ar",
		"16000",
		"-f",
		"wav",
		file,
	];
	const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
	let stderrTail = "";
	proc.stderr?.on("data", (chunk: Buffer) => {
		stderrTail = (stderrTail + chunk.toString()).slice(-4000);
	});

	let settled = false;
	let done = false;
	/** Outcome of the first stop(): replay this on later stop() calls so they never hang. */
	let capturedResult: Promise<Buffer> | undefined;
	const cleanup = () => rmSync(dir, { recursive: true, force: true });
	const failOnce = (message: string) => {
		if (done) return;
		done = true;
		onError?.(message);
	};

	proc.on("error", (error) => {
		// ffmpeg binary missing / failed to spawn.
		failOnce(`ffmpeg could not be started: ${error.message}`);
		cleanup();
	});
	proc.on("close", (code) => {
		// ffmpeg exited BEFORE stop() was called → it failed to open the mic.
		// Surface the reason immediately instead of leaving the user waiting.
		if (!settled) {
			const hint = summarizeFfmpegError(stderrTail);
			failOnce(
				`Recording failed (ffmpeg exited ${code ?? "early"}). ${
					hint ||
					"Check microphone permission (System Settings → Privacy → Microphone) and that a mic is connected."
				}`,
			);
		}
	});

	const stop = () => {
		if (capturedResult) return capturedResult;
		const pending = new Promise<Buffer>((resolve, reject) => {
			settled = true;
			const finish = () => {
				if (done) return;
				done = true;
				try {
					if (!existsSync(file)) {
						const hint = summarizeFfmpegError(stderrTail);
						reject(
							new Error(
								`Recording produced no audio. ${
									/failed to create av capture input|input\/output error|permission/i.test(hint)
										? "The terminal needs Microphone permission: System Settings → Privacy & Security → Microphone → enable it for your terminal app."
										: "Check that a microphone is connected and not in use by another app."
								} ${hint || ""}`,
							),
						);
						return;
					}
					const buffer = readFileSync(file);
					if (isSilentWav(buffer)) {
						reject(
							new Error(
								"No sound was captured (silence). macOS is likely denying microphone access to this terminal. Fix: System Settings → Privacy & Security → Microphone → enable it for your terminal app, then restart Porcupine. Also check the mic isn't muted or in use by another app.",
							),
						);
						return;
					}
					resolve(buffer);
				} catch (error) {
					reject(error instanceof Error ? error : new Error(String(error)));
				} finally {
					cleanup();
				}
			};
			// Already exited? Finish immediately (no hang).
			if (proc.exitCode !== null) {
				finish();
				return;
			}
			proc.once("close", finish);
			proc.once("error", () => {
				if (done) return;
				done = true;
				reject(
					new Error(
						"ffmpeg could not be started. Install it (brew install ffmpeg) or fix microphone permissions.",
					),
				);
				cleanup();
			});
			proc.kill("SIGTERM");
			// Safety: if ffmpeg ignores SIGTERM, force-kill after 3s so stop()
			// never hangs and the mic is always released.
			setTimeout(() => {
				if (done) return;
				if (proc.exitCode === null) {
					proc.kill("SIGKILL");
				}
			}, 3000);
		});
		capturedResult = pending;
		return capturedResult;
	};

	return {
		stop,
		cancel: () => {
			if (settled) return;
			settled = true;
			proc.kill("SIGKILL");
			cleanup();
		},
	};
}
