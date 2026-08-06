/**
 * Text-to-speech via Kokoro (82M params, open-weight, on-device).
 * The model auto-downloads from the Hugging Face Hub on first use
 * (transformers.js cache under ~/.cache/huggingface) with progress reported
 * through a callback — nothing ships with Porcupine itself.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

type ProgressCallback = (progress: { status: string; progress?: number; file?: string }) => void;

const require = createRequire(import.meta.url);

const KOKORO_VOICE_URL = (voice: string) =>
	`https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/${voice}.bin`;

/**
 * Kokoro's Node loader reads voices from <pkg>/dist/voices/*.bin, but the npm
 * package ships NONE of them (the HF-download branch is browser-only). Ensure
 * the requested voice exists on disk — download it on first use so TTS works.
 */
export async function ensureVoiceFile(voice: string, progress?: ProgressCallback): Promise<string> {
	const moduleFile = require.resolve("kokoro-js");
	const voicesDir = join(dirname(dirname(moduleFile)), "dist", "voices");
	const file = join(voicesDir, `${voice}.bin`);
	if (existsSync(file)) return file;
	mkdirSync(voicesDir, { recursive: true });
	progress?.({ status: "download", progress: 0, file: `${voice}.bin` });
	const response = await fetch(KOKORO_VOICE_URL(voice));
	if (!response.ok) {
		throw new Error(
			`Could not download Kokoro voice "${voice}" (HTTP ${response.status}). Check network access to huggingface.co.`,
		);
	}
	const buffer = Buffer.from(await response.arrayBuffer());
	writeFileSync(file, buffer);
	progress?.({ status: "download", progress: 100, file: `${voice}.bin` });
	return file;
}

type RawAudioLike = {
	audio: Float32Array;
	sampling_rate: number;
};

type KokoroModule = {
	KokoroTTS: {
		from_pretrained(
			model_id: string,
			options?: { dtype?: "fp32" | "fp16" | "q8" | "q4" | "q4f16"; progress_callback?: ProgressCallback },
		): Promise<{ generate(text: string, options?: { voice: string; speed?: number }): Promise<RawAudioLike> }>;
	};
};

let cachedTts:
	| { generate(text: string, options?: { voice: string; speed?: number }): Promise<RawAudioLike> }
	| undefined;

/** Load (and cache) the Kokoro TTS model. First use triggers the auto-download. */
async function getTts(
	progress?: ProgressCallback,
): Promise<{ generate(text: string, options?: { voice: string; speed?: number }): Promise<RawAudioLike> }> {
	if (cachedTts) return cachedTts;
	const mod = (await import("kokoro-js")) as unknown as KokoroModule;
	cachedTts = await mod.KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
		dtype: "q8",
		progress_callback: progress,
	});
	return cachedTts;
}

/** Raw 24 kHz mono Float32 samples → a playable WAV buffer. */
export function samplesToWav(samples: Float32Array, sampleRate = 24000): Buffer {
	const bytesPerSample = 2;
	const dataSize = samples.length * bytesPerSample;
	const buffer = Buffer.alloc(44 + dataSize);
	buffer.write("RIFF", 0);
	buffer.writeUInt32LE(36 + dataSize, 4);
	buffer.write("WAVE", 8);
	buffer.write("fmt ", 12);
	buffer.writeUInt32LE(16, 16); // fmt chunk size
	buffer.writeUInt16LE(1, 20); // PCM
	buffer.writeUInt16LE(1, 22); // mono
	buffer.writeUInt32LE(sampleRate, 24);
	buffer.writeUInt32LE(sampleRate * bytesPerSample, 28); // byte rate
	buffer.writeUInt16LE(bytesPerSample, 32); // block align
	buffer.writeUInt16LE(16, 34); // bits per sample
	buffer.write("data", 36);
	buffer.writeUInt32LE(dataSize, 40);
	for (let i = 0; i < samples.length; i++) {
		const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
		buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
	}
	return buffer;
}

/**
 * Speak text with Kokoro; resolves with a WAV buffer.
 * The first call downloads the model (~300 MB, q8) — pass a progress callback
 * so the TUI can show download progress.
 */
export async function synthesizeSpeech(
	text: string,
	options: { voice?: string; speed?: number; progress?: ProgressCallback } = {},
): Promise<Buffer> {
	const voice = options.voice ?? "af_heart";
	// Kokoro's Node loader reads voices from the package dir and never
	// downloads them — ensure the file exists (auto-download on first use).
	await ensureVoiceFile(voice, options.progress);
	const tts = await getTts(options.progress);
	const audio = await tts.generate(text, { voice, speed: options.speed ?? 1 });
	return samplesToWav(audio.audio, audio.sampling_rate);
}
