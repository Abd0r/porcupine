import { describe, expect, it } from "vitest";
import { BUILTIN_SLASH_COMMANDS } from "../src/core/slash-commands.ts";
import {
	formatInteractionMode,
	getSessionInteractionMode,
	isAskMode,
	setSessionInteractionMode,
} from "../src/porcupine/interaction-mode.ts";

describe("interaction modes", () => {
	it("defaults sessions to Normal and switches policies independently", () => {
		const key = `mode-${Date.now()}`;
		expect(getSessionInteractionMode(key)).toBe("normal");
		expect(isAskMode(key)).toBe(false);

		setSessionInteractionMode(key, "ask");
		expect(getSessionInteractionMode(key)).toBe("ask");
		expect(isAskMode(key)).toBe(true);

		setSessionInteractionMode(key, "auto");
		expect(getSessionInteractionMode(key)).toBe("auto");
		expect(formatInteractionMode("auto")).toContain("LLM safety gate");
	});

	it("advertises the /modes interaction-mode picker", () => {
		expect(BUILTIN_SLASH_COMMANDS).toContainEqual({
			name: "modes",
			description: "Choose Ask, Normal, or Auto interaction mode",
		});
		expect(BUILTIN_SLASH_COMMANDS.map((command) => command.name)).not.toContain("models");
	});
});
