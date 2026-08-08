import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sliceByColumn, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "../src/utils.ts";

describe("cbF unicode/width edge cases", () => {
	it("emoji double-width truncation keeps fit with ellipsis", () => {
		// '😀' is 2 columns. maxWidth 5 with '...' (3 cols) leaves 2 columns -> 1 emoji only.
		const out = truncateToWidth("😀😀😀", 5);
		assert.equal(visibleWidth(out), 5, `got width ${visibleWidth(out)}: ${JSON.stringify(out)}`);
	});

	it("zero-width combining chars are preserved as zero cells", () => {
		const comb = "e\u0301"; // e + combining acute
		assert.equal(visibleWidth(comb), 1);
	});

	it("wrapTextWithAnsi at width 1 wraps, returns width-1 lines", () => {
		const lines = wrapTextWithAnsi("abcd", 1);
		for (const l of lines) assert.ok(visibleWidth(l) <= 1, `line too wide: ${JSON.stringify(l)}`);
		assert.ok(lines.length >= 4);
	});

	it("truncateToWidth(_, 0) returns empty (guard)", () => {
		assert.equal(truncateToWidth("abc", 0), "");
	});

	it("sliceByColumn with wide char at boundary strict=false does not crash and fits", () => {
		const s = sliceByColumn("ab😀cd", 1, 3);
		assert.ok(visibleWidth(s) <= 3, `sliced width ${visibleWidth(s)}`);
	});
});
