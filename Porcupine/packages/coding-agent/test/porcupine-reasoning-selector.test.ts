import { describe, expect, it } from "vitest";
import {
	formatReasoningModeLabel,
	parseReasoningModeArg,
} from "../src/modes/interactive/components/thinking-selector.ts";

describe("parseReasoningModeArg", () => {
	it("parses fixed levels and aliases", () => {
		expect(parseReasoningModeArg("high")).toBe("high");
		expect(parseReasoningModeArg("MIN")).toBe("minimal");
		expect(parseReasoningModeArg("none")).toBe("off");
		expect(parseReasoningModeArg("extra-high")).toBe("xhigh");
		expect(parseReasoningModeArg("ultra")).toBe("max");
	});

	it("parses adaptive aliases", () => {
		expect(parseReasoningModeArg("adaptive")).toBe("adaptive");
		expect(parseReasoningModeArg("adapt")).toBe("adaptive");
		expect(parseReasoningModeArg("auto")).toBe("adaptive");
	});

	it("rejects garbage", () => {
		expect(parseReasoningModeArg("banana")).toBeUndefined();
		expect(parseReasoningModeArg("")).toBeUndefined();
	});
});

describe("formatReasoningModeLabel", () => {
	it("formats adaptive with last resolved", () => {
		expect(formatReasoningModeLabel("adaptive")).toBe("adaptive");
		expect(formatReasoningModeLabel("adaptive", "high")).toBe("adaptive→high");
		expect(formatReasoningModeLabel("off")).toBe("thinking off");
		expect(formatReasoningModeLabel("medium")).toBe("medium");
	});
});
