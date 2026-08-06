/**
 * Speech-to-text via Moonshine (on-device, MIT).
 *
 * The npm bundle (@moonshine-ai/moonshine-js) is browser-oriented and its
 * onnxruntime-web backend cannot initialize in Node ("blob:" URL rejection),
 * so we run the SAME ONNX models directly on onnxruntime-node — the engine
 * transformers.js uses, proven working in Node. The tiny model's weights ship
 * inside the npm package; "base" downloads from the Hugging Face Hub.
 */

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeWavToFloat32 } from "./wav.ts";

const require = createRequire(import.meta.url);

interface Session {
	run(feeds: Record<string, unknown>): Promise<Record<string, any>>;
}

interface Shape {
	numLayers: number;
	numKVHeads: number;
	headDim: number;
}

const SHAPES: Record<string, Shape> = {
	tiny: { numLayers: 6, numKVHeads: 8, headDim: 36 },
	base: { numLayers: 8, numKVHeads: 8, headDim: 52 },
};

const START_TOKEN = 1;
const EOS_TOKEN = 2;

let cachedSessions: { encoder: Session; decoder: Session; shape: Shape } | undefined;
let cachedModelId: string | undefined;

/** Resolve the ONNX model directory for a Moonshine model id. */
function resolveModelDir(modelId: string): string {
	if (modelId === "tiny" || modelId === "base") {
		const moduleFile = fileURLToPath(import.meta.resolve("@moonshine-ai/moonshine-js"));
		const pkgDir = dirname(dirname(moduleFile));
		return join(pkgDir, "dist", "model", modelId);
	}
	return modelId;
}

function argMax(array: Float32Array | number[]): number {
	let bestIndex = 0;
	let bestValue = -Infinity;
	for (let i = 0; i < array.length; i++) {
		const value = array[i]!;
		if (value > bestValue) {
			bestValue = value;
			bestIndex = i;
		}
	}
	return bestIndex;
}

async function loadSessions(modelId: string): Promise<{ encoder: Session; decoder: Session; shape: Shape }> {
	if (cachedSessions && cachedModelId === modelId) return cachedSessions;
	const dir = resolveModelDir(modelId);
	const quantized = join(dir, "quantized");
	const encoderFile = join(quantized, "encoder_model.onnx");
	const decoderFile = join(quantized, "decoder_model_merged.onnx");
	if (!existsSync(encoderFile) || !existsSync(decoderFile)) {
		throw new Error(
			`Moonshine model "${modelId}" is not available locally (${dir}). For "base", download the ONNX export from https://huggingface.co/UsefulSensors/moonshine-base into ${quantized}/.`,
		);
	}
	const ort = (await import("onnxruntime-node")) as unknown as {
		InferenceSession: {
			create(path: string): Promise<Session>;
		};
		Tensor: new (type: string, data: unknown, dims: number[]) => unknown;
	};
	const [encoder, decoder] = await Promise.all([
		ort.InferenceSession.create(encoderFile),
		ort.InferenceSession.create(decoderFile),
	]);
	cachedSessions = { encoder, decoder, shape: SHAPES[modelId] ?? SHAPES.tiny! };
	cachedModelId = modelId;
	return cachedSessions;
}

/** Transcribe a WAV buffer (16 kHz mono) to text. */
export async function transcribeSpeech(wav: Buffer, modelId = "tiny"): Promise<string> {
	const { encoder, decoder, shape } = await loadSessions(modelId);
	const audio = decodeWavToFloat32(wav);

	const ort = (await import("onnxruntime-node")) as unknown as {
		Tensor: new (type: string, data: unknown, dims: number[]) => unknown;
	};

	const encoderOutput = await encoder.run({
		input_values: new ort.Tensor("float32", audio, [1, audio.length]),
	});
	const encoderHidden = (encoderOutput as Record<string, any>).last_hidden_state;

	// past_key_values.<layer>.{decoder,encoder}.{key,value} — empty at first.
	const pastKeyValues: Record<string, unknown> = {};
	for (let i = 0; i < shape.numLayers; i++) {
		for (const part of ["decoder", "encoder"] as const) {
			for (const kv of ["key", "value"] as const) {
				pastKeyValues[`past_key_values.${i}.${part}.${kv}`] = new ort.Tensor(
					"float32",
					[],
					[0, shape.numKVHeads, 1, shape.headDim],
				);
			}
		}
	}

	const maxLen = Math.trunc((audio.length / 16000) * 6);
	const tokens: number[] = [START_TOKEN];
	let nextToken = START_TOKEN;

	for (let i = 0; i < maxLen && nextToken !== EOS_TOKEN; i++) {
		// The decoder consumes only the last token (history lives in the KV cache).
		const inputIds = i === 0 ? tokens : [nextToken];
		const decoderInput: Record<string, unknown> = {
			input_ids: new ort.Tensor("int64", inputIds, [1, inputIds.length]),
			encoder_hidden_states: encoderHidden,
			use_cache_branch: new ort.Tensor("bool", [i > 0], [1]),
		};
		Object.assign(decoderInput, pastKeyValues);

		const decoderOutput = (await decoder.run(decoderInput)) as Record<string, any>;
		const logits = decoderOutput.logits;
		// onnxruntime-node's Tensor.getData() is ASYNC (returns a Promise) —
		// treating it as sync silently produced NaN argmax → token 0 forever.
		let logitsData: Float32Array | number[];
		if (typeof logits?.getData === "function") {
			logitsData = (await logits.getData()) as Float32Array;
		} else {
			logitsData = Array.from(logits ?? []);
		}
		nextToken = argMax(logitsData);
		tokens.push(nextToken);

		{
			// KV cache update on EVERY step: at step 0 all keys are written; from
			// step 1 onward only the decoder cache advances (encoder states are
			// fixed). Skipping step 0 passed empty tensors into step 1 and broke
			// the encoder-attention MatMul.
			const present = Object.entries(decoderOutput)
				.filter(([key]) => key.includes("present"))
				.map(([, value]) => value);
			Object.keys(pastKeyValues).forEach((key, index) => {
				const value = present[index];
				if (value !== undefined && (i === 0 || !key.includes("encoder"))) {
					pastKeyValues[key] = value;
				}
			});
		}
	}

	const tokenizer = require("llama-tokenizer-js") as { default: { decode(tokens: number[]): string } };
	return tokenizer.default.decode(tokens.slice(0, -1)).trim();
}
