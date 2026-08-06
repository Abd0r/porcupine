import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SettingsManager } from "../src/core/settings-manager.ts";
import { BUILTIN_SLASH_COMMANDS } from "../src/core/slash-commands.ts";
import { parseReasoningVisibilityCommand } from "../src/modes/interactive/reasoning-visibility.ts";

describe("/reasoning-show", () => {
	it("maps yes to visible and no to hidden", () => {
		expect(parseReasoningVisibilityCommand("/reasoning-show yes")).toEqual({ kind: "set", hide: false });
		expect(parseReasoningVisibilityCommand("/reasoning-show no")).toEqual({ kind: "set", hide: true });
	});

	it("reports status with no argument and rejects ambiguous values", () => {
		expect(parseReasoningVisibilityCommand("/reasoning-show")).toEqual({ kind: "status" });
		expect(parseReasoningVisibilityCommand("/reasoning-show maybe")).toEqual({
			kind: "invalid",
			message: "Usage: /reasoning-show [yes|no]",
		});
		expect(parseReasoningVisibilityCommand("/reasoning high")).toBeNull();
	});

	it("is advertised as a built-in slash command", () => {
		expect(BUILTIN_SLASH_COMMANDS).toContainEqual({
			name: "reasoning-show",
			description: "Show or hide reasoning blocks",
			argumentHint: "[yes|no]",
		});
	});

	it("persists the visibility values used by yes and no", async () => {
		const root = mkdtempSync(join(tmpdir(), "porcupine-reasoning-visibility-"));
		const agentDir = join(root, "agent");
		mkdirSync(agentDir);
		const manager = SettingsManager.create(root, agentDir);

		manager.setHideThinkingBlock(false);
		await manager.flush();
		expect(SettingsManager.create(root, agentDir).getHideThinkingBlock()).toBe(false);

		manager.setHideThinkingBlock(true);
		await manager.flush();
		expect(JSON.parse(readFileSync(join(agentDir, "settings.json"), "utf8"))).toMatchObject({
			hideThinkingBlock: true,
		});
		expect(SettingsManager.create(root, agentDir).getHideThinkingBlock()).toBe(true);
	});
});
