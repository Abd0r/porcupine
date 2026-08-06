/**
 * Ambient types for @moonshine-ai/moonshine-js (ships a minified bundle with
 * no type declarations). Only the Node-relevant surface is declared.
 */
declare module "@moonshine-ai/moonshine-js" {
	export class MoonshineModel {
		constructor(modelURL: string);
		loadModel(): Promise<void>;
		generate(audio: Float32Array): Promise<string>;
		benchmark(): Promise<{ [key: string]: number }>;
	}
	export const MoonshineError: {
		message: string;
		reason?: string;
		recommendations?: string;
	};
}
