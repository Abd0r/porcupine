import { describe, expect, it } from "vitest";
import {
	clampAdaptiveToAvailable,
	heuristicAdaptiveEffort,
	parseAdaptiveEffort,
} from "../src/porcupine/adaptive-reasoning.ts";
import {
	detectDangerousCommand,
	disableSessionAuto,
	enableSessionAuto,
	guardBashCommand,
	isSessionAutoEnabled,
	toggleSessionAuto,
} from "../src/porcupine/auto-mode.ts";
import { buildPersonalityReminder, isTrivialChatTurn, userRequestedPlanning } from "../src/porcupine/personality.ts";

describe("auto-mode", () => {
	it("detects hardline and dangerous commands", () => {
		const hard = detectDangerousCommand("rm -rf /");
		expect(hard?.hardline).toBe(true);

		const dang = detectDangerousCommand("sudo apt install foo");
		expect(dang?.hardline).toBe(false);
		expect(dang?.patternKey).toBe("sudo");

		expect(detectDangerousCommand("ls -la")).toBeNull();
	});

	it("toggles session auto state", () => {
		const key = `test-${Date.now()}`;
		expect(isSessionAutoEnabled(key)).toBe(false);
		enableSessionAuto(key);
		expect(isSessionAutoEnabled(key)).toBe(true);
		expect(toggleSessionAuto(key)).toBe(false);
		disableSessionAuto(key);
		expect(isSessionAutoEnabled(key)).toBe(false);
	});

	it("fails closed for flagged commands without UI and Auto off", async () => {
		const decision = await guardBashCommand({
			command: "rm -rf ./node_modules",
			sessionKey: `no-ui-${Date.now()}`,
			modelRuntime: {} as any,
			model: undefined,
		});
		expect(decision.approved).toBe(false);
		expect(decision.via === "error" || decision.via === "hardline").toBe(true);
	});

	it("allows safe commands without classification", async () => {
		const decision = await guardBashCommand({
			command: "echo hello",
			sessionKey: `safe-${Date.now()}`,
			modelRuntime: {} as any,
			model: undefined,
		});
		expect(decision).toEqual({ approved: true, via: "safe" });
	});
});

describe("adaptive-reasoning", () => {
	it("parses effort words", () => {
		expect(parseAdaptiveEffort("high")).toBe("high");
		expect(parseAdaptiveEffort("  MAX!!! ")).toBe("max");
		expect(parseAdaptiveEffort("please use medium now")).toBe("medium");
		expect(parseAdaptiveEffort("nonsense")).toBe("medium");
	});

	it("heuristics map chit-chat low and hard tasks high", () => {
		expect(heuristicAdaptiveEffort("hi")).toBe("minimal");
		expect(heuristicAdaptiveEffort("fix the race condition carefully")).toBe("high");
	});

	it("clamps to available levels", () => {
		expect(clampAdaptiveToAvailable("xhigh", ["off", "low", "medium", "high"])).toBe("high");
		expect(clampAdaptiveToAvailable("minimal", ["medium", "high"])).toBe("medium");
	});
});

describe("personality (model-led plan/skill/tool)", () => {
	it("detects trivial chat and explicit plan requests", () => {
		expect(isTrivialChatTurn("hey")).toBe(true);
		expect(isTrivialChatTurn("refactor the agent runtime please")).toBe(false);
		expect(userRequestedPlanning("make a plan for this")).toBe(true);
		expect(userRequestedPlanning("ship the fix")).toBe(false);
		expect(buildPersonalityReminder()).toBe("");
		expect(buildPersonalityReminder({ forcePlan: true })).toContain("explicit plan");
	});
});
