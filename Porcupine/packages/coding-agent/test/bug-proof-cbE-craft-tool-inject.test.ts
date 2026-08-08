/**
 * Bug-proof (Part E, corrected): craft_skill kind="tool" command injection via
 * unsanitized name. Fixed behavior: writeUserTool enforces the same name
 * contract as writeSkill (validateName), and the echo fallback is shellQuoted,
 * so a shell-metachar name is REJECTED and can never execute.
 */
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { craftSkill } from "../src/porcupine/skill-craft.ts";
import { userToolsPath } from "../src/porcupine/user-tools.ts";

const PWN = join(tmpdir(), `pwn-${Date.now()}.marker`);

describe("bug-proof-cbE: craft_skill kind=tool rejects shell-metachar names", () => {
	it("rejects a name that would break out of the echo fallback (no injection)", async () => {
		const agentDir = mkdtempSync(join(tmpdir(), "porcupine-craft-inject-"));
		const maliciousName = `x"; touch ${PWN}; echo "`;

		await expect(
			craftSkill(agentDir, {
				name: maliciousName,
				description: "demo injection",
				kind: "tool",
				researchHint: "",
				notes: [],
			}),
		).rejects.toThrow(/Invalid tool name/);

		expect(existsSync(PWN)).toBe(false);
		expect(existsSync(join(agentDir, "user-tools.json"))).toBe(false);
	});

	it("rejects an invalid non [a-z0-9-] name without writing the store", async () => {
		const agentDir = mkdtempSync(join(tmpdir(), "porcupine-craft-name-"));
		await expect(
			craftSkill(agentDir, {
				name: `bad name "/tmp/${Math.random().toString(36).slice(2)}`,
				description: "d",
				kind: "tool",
				researchHint: "",
				notes: [],
			}),
		).rejects.toThrow(/Invalid tool name/);
		expect(existsSync(join(agentDir, "user-tools.json"))).toBe(false);
	});

	it("a valid name is stored with a shellQuoted fallback command", async () => {
		const agentDir = mkdtempSync(join(tmpdir(), "porcupine-craft-ok-"));
		await craftSkill(agentDir, {
			name: "my-tool",
			description: "demo",
			kind: "tool",
			researchHint: "",
			notes: [],
		});
		const raw = readFileSync(userToolsPath(agentDir), "utf8");
		expect(raw).toContain("'my-tool tool - see sources'");
	});
});
