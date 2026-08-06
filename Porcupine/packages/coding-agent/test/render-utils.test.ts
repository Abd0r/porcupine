import { describe, expect, it } from "vitest";
import { getTextOutput } from "../src/core/tools/render-utils.ts";

describe("getTextOutput", () => {
	it("returns empty string for undefined result", () => {
		expect(getTextOutput(undefined, true)).toBe("");
	});

	it("does not crash when result.content is undefined (regression: TUI crash)", () => {
		// A tool result without a content array used to crash the render path
		// ("Cannot read properties of undefined (reading 'filter')").
		expect(getTextOutput({ content: undefined } as never, true)).toBe("");
	});

	it("joins text blocks", () => {
		expect(
			getTextOutput(
				{
					content: [
						{ type: "text", text: "a" },
						{ type: "text", text: "b" },
					],
				},
				true,
			),
		).toBe("a\nb");
	});
});
