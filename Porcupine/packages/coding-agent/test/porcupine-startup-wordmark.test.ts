import { describe, expect, it } from "vitest";
import {
	getPorcupineBlockWordmark,
	PORCUPINE_BLOCK_WORDMARK,
	PORCUPINE_BLOCK_WORDMARK_COLOR,
	PORCUPINE_BLOCK_WORDMARK_MIN_COLUMNS,
	PORCUPINE_BLOCK_WORDMARK_WIDTH,
} from "../src/porcupine/branding.ts";

describe("Porcupine startup wordmark", () => {
	it("uses six bounded lines that fit a standard terminal", () => {
		const lines = PORCUPINE_BLOCK_WORDMARK.split("\n");

		expect(lines).toHaveLength(6);
		expect(PORCUPINE_BLOCK_WORDMARK_WIDTH).toBe(Math.max(...lines.map((line) => line.length)));
		expect(PORCUPINE_BLOCK_WORDMARK_WIDTH).toBeLessThanOrEqual(80);
		expect(PORCUPINE_BLOCK_WORDMARK).toContain("██");
		expect(PORCUPINE_BLOCK_WORDMARK_COLOR).toBe("#5EEAD4");
	});

	it("renders the block wordmark only when header padding also fits", () => {
		expect(getPorcupineBlockWordmark(PORCUPINE_BLOCK_WORDMARK_MIN_COLUMNS)).toBe(PORCUPINE_BLOCK_WORDMARK);
		expect(getPorcupineBlockWordmark(PORCUPINE_BLOCK_WORDMARK_MIN_COLUMNS - 1)).toBeUndefined();
	});
});
