/**
 * Minimal 16-bit PCM WAV parser → Float32Array at 16 kHz (Moonshine input).
 * Independent decoder so STT has no browser Web Audio dependency.
 */

export function decodeWavToFloat32(wav: Buffer): Float32Array {
	if (wav.length < 44 || wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") {
		throw new Error("Not a RIFF/WAVE file");
	}
	// Scan chunks for "fmt " and "data".
	let offset = 12;
	let sampleRate = 16000;
	let bitsPerSample = 16;
	let channels = 1;
	let dataOffset = -1;
	let dataLength = 0;

	while (offset + 8 <= wav.length) {
		const id = wav.toString("ascii", offset, offset + 4);
		const size = wav.readUInt32LE(offset + 4);
		if (id === "fmt ") {
			channels = wav.readUInt16LE(offset + 10);
			sampleRate = wav.readUInt32LE(offset + 12);
			bitsPerSample = wav.readUInt16LE(offset + 22);
		} else if (id === "data") {
			dataOffset = offset + 8;
			dataLength = size;
			break;
		}
		offset += 8 + size + (size % 2); // chunks are word-aligned
	}
	if (dataOffset === -1) throw new Error("No data chunk in WAV");
	if (bitsPerSample !== 16) throw new Error(`Unsupported bit depth ${bitsPerSample} (need 16)`);

	const samples = Math.floor(dataLength / (2 * channels));
	const out = new Float32Array(samples);
	for (let i = 0; i < samples; i++) {
		let sum = 0;
		for (let c = 0; c < channels; c++) {
			sum += wav.readInt16LE(dataOffset + (i * channels + c) * 2);
		}
		out[i] = sum / channels / 32768;
	}
	void sampleRate; // Moonshine expects 16 kHz; ffmpeg always records at 16 kHz
	return out;
}
