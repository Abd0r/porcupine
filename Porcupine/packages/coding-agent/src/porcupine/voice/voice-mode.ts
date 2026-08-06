/**
 * Voice Mode orchestrator: push-to-talk recording → Moonshine STT → the text is
 * returned to the caller (which injects it as a user prompt) → the agent's
 * response is spoken via Kokoro TTS + the platform player.
 *
 * All model weights auto-download on first use; nothing ships with Porcupine.
 */

import { playWav } from "./player.ts";
import { getDeviceName, resolveMacMicIndex, startRecording } from "./recorder.ts";
import { transcribeSpeech } from "./stt.ts";
import { synthesizeSpeech } from "./tts.ts";

export interface VoiceModeCallbacks {
	onStatus: (status: string) => void;
	onError: (message: string) => void;
	/** The 30s safety auto-stop captured audio; the host decides native vs STT. */
	onCapture?: (wav: Buffer) => void;
}

export interface VoiceOptions {
	sttModel: string;
	ttsVoice: string;
	autoSpeak: boolean;
	/** Explicit input device index (macOS); unset = auto-select a real mic. */
	inputDevice?: number;
}

export class VoiceMode {
	private callbacks: VoiceModeCallbacks;
	private options: VoiceOptions;
	private recording = false;
	private speaking = false;
	private activeRecorder: ReturnType<typeof startRecording> | undefined;
	private safetyTimer: ReturnType<typeof setTimeout> | undefined;

	/**
	 * Stop the current recording and return the raw WAV (native-audio path:
	 * the model hears the audio directly, no STT). Undefined when not recording.
	 */
	async stopToWav(): Promise<Buffer | undefined> {
		const recorder = this.activeRecorder;
		if (!recorder) return undefined;
		this.activeRecorder = undefined;
		this.recording = false;
		if (this.safetyTimer) {
			clearTimeout(this.safetyTimer);
			this.safetyTimer = undefined;
		}
		try {
			return await recorder.stop();
		} catch (error) {
			this.callbacks.onStatus("");
			this.callbacks.onError(`Recording failed: ${error instanceof Error ? error.message : String(error)}`);
			return undefined;
		}
	}

	constructor(callbacks: VoiceModeCallbacks, options: VoiceOptions) {
		this.callbacks = callbacks;
		this.options = options;
	}

	get isRecording(): boolean {
		return this.recording;
	}

	get isSpeaking(): boolean {
		return this.speaking;
	}

	/**
	 * Push-to-talk toggle: start recording, or stop + transcribe. Resolves with
	 * the transcription when a capture completes (or undefined on cancel/error).
	 * Never throws — failures surface through the onError callback.
	 */
	async toggle(): Promise<string | undefined> {
		if (this.recording) {
			const recorder = this.activeRecorder;
			this.activeRecorder = undefined;
			this.recording = false;
			if (!recorder) return undefined;
			this.callbacks.onStatus("🎙️ Transcribing…");
			let wav: Buffer;
			try {
				wav = await recorder.stop();
			} catch (error) {
				this.callbacks.onStatus("");
				this.callbacks.onError(`Recording failed: ${error instanceof Error ? error.message : String(error)}`);
				return undefined;
			}
			return this.transcribe(wav);
		}
		if (this.speaking) {
			this.callbacks.onStatus("Still speaking…");
			return undefined;
		}
		this.recording = true;
		this.callbacks.onStatus(
			`🎤 Recording… (${getDeviceName(this.options.inputDevice ?? resolveMacMicIndex())}, press Space again to send)`,
		);
		const recorder = startRecording((message) => {
			// ffmpeg failed at startup (mic permission/device): unwind cleanly.
			this.recording = false;
			this.activeRecorder = undefined;
			if (this.safetyTimer) {
				clearTimeout(this.safetyTimer);
				this.safetyTimer = undefined;
			}
			this.callbacks.onStatus("");
			this.callbacks.onError(message);
		}, this.options.inputDevice);
		this.activeRecorder = recorder;
		// Auto-stop after 30 s of continuous talking (safety limit). The captured
		// audio is handed to the host via onCapture — it decides native-audio vs
		// STT — instead of silently running a STT transcribe nobody consumes.
		this.safetyTimer = setTimeout(() => void this.stopByTimeout(), 30_000);
		return undefined;
	}

	/**
	 * Safety auto-stop: finalize the capture and hand the raw WAV to the host
	 * (which routes it to the native-audio prompt or the STT fallback).
	 */
	private async stopByTimeout(): Promise<void> {
		if (!this.recording) return;
		const recorder = this.activeRecorder;
		this.activeRecorder = undefined;
		this.recording = false;
		if (!recorder) return;
		if (this.safetyTimer) {
			clearTimeout(this.safetyTimer);
			this.safetyTimer = undefined;
		}
		this.callbacks.onStatus("🎙️ Transcribing…");
		try {
			const wav = await recorder.stop();
			if (wav) this.callbacks.onCapture?.(wav);
		} catch (error) {
			this.callbacks.onStatus("");
			this.callbacks.onError(`Recording failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	async transcribe(wav: Buffer): Promise<string | undefined> {
		if (this.safetyTimer) {
			clearTimeout(this.safetyTimer);
			this.safetyTimer = undefined;
		}
		try {
			const text = await transcribeSpeech(wav, this.options.sttModel);
			if (!text) {
				this.callbacks.onStatus("");
				return undefined;
			}
			return text;
		} catch (error) {
			this.callbacks.onStatus("");
			this.callbacks.onError(`Speech recognition failed: ${error instanceof Error ? error.message : String(error)}`);
			return undefined;
		}
	}

	/**
	 * Speak an agent response. First use triggers the Kokoro model download —
	 * progress is reported through onStatus.
	 */
	async speak(text: string): Promise<void> {
		if (this.speaking || !this.options.autoSpeak) return;
		const clean = text.replace(/MEDIA:\S+/g, "").trim();
		if (!clean) return;
		this.speaking = true;
		this.callbacks.onStatus("🔉 Speaking…");
		try {
			const wav = await synthesizeSpeech(clean, {
				voice: this.options.ttsVoice,
				progress: ({ status, progress }) => {
					if (status === "download") {
						this.callbacks.onStatus(
							`📥 Downloading Kokoro voice… ${progress != null ? `${Math.round(progress)}%` : ""}`,
						);
					}
				},
			});
			await playWav(wav);
		} catch (error) {
			this.callbacks.onError(`Text-to-speech failed: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			this.speaking = false;
			this.callbacks.onStatus("");
		}
	}
}
