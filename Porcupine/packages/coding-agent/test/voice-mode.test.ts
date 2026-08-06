import { describe, expect, it } from "vitest";
import { samplesToWav } from "../src/porcupine/voice/tts.ts";
import { decodeWavToFloat32 } from "../src/porcupine/voice/wav.ts";

describe("voice utils", () => {
	it("samplesToWav → decodeWavToFloat32 roundtrips 16-bit PCM", () => {
		const samples = new Float32Array([0, 0.5, -0.5, 0.25, -1, 1, 0.001, -0.001]);
		const wav = samplesToWav(samples, 16000);
		const decoded = decodeWavToFloat32(wav);
		expect(decoded.length).toBe(samples.length);
		for (let i = 0; i < samples.length; i++) {
			// 16-bit quantization tolerance
			expect(Math.abs(decoded[i]! - samples[i]!)).toBeLessThan(1 / 16000);
		}
	});

	it("rejects non-WAV input", () => {
		expect(() => decodeWavToFloat32(Buffer.from("NOTAWAUDIOFILE"))).toThrow();
	});

	it("decodes a generated 44-byte header WAV with a data chunk", () => {
		const wav = samplesToWav(new Float32Array([0.1, 0.2]), 24000);
		const decoded = decodeWavToFloat32(wav);
		expect(decoded).toHaveLength(2);
	});
});
