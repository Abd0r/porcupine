import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	createToolDefinitionFromRecord,
	loadUserTools,
	userToolsPath,
	writeUserTool,
} from "../src/porcupine/user-tools.ts";

describe("user-tools", () => {
	it("maps a tool record to a ToolDefinition and persists it", async () => {
		const agentDir = mkdtempSync(join(tmpdir(), "porcupine-user-tools-"));
		writeUserTool(agentDir, {
			name: "hello",
			description: "say hello",
			parameters: {},
			command: "echo 'hello'",
		});
		const records = loadUserTools(agentDir);
		expect(records).toHaveLength(1);
		expect(records[0]!.name).toBe("hello");

		const def = createToolDefinitionFromRecord(records[0]!);
		expect(def.name).toBe("hello");
		expect(def.parameters).toBeDefined();
	});

	it("skips corrupt entries without crashing", () => {
		const agentDir = mkdtempSync(join(tmpdir(), "porcupine-user-tools-corrupt-"));
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(
			userToolsPath(agentDir),
			JSON.stringify([
				{ name: "good", description: "a", parameters: { x: { type: "string" } }, command: "echo {{x}}" },
				{ description: "missing name" },
				"not an object",
				{ name: "nocmd", description: "b", parameters: {} },
			]),
			"utf8",
		);
		const warns: string[] = [];
		const records = loadUserTools(agentDir, (m) => warns.push(m));
		expect(records).toHaveLength(1);
		expect(records[0]!.name).toBe("good");
		expect(warns.length).toBeGreaterThan(0);
		expect(readFileSync(userToolsPath(agentDir), "utf8")).toContain("good");
	});

	it("refuses to duplicate a tool name without force", () => {
		const agentDir = mkdtempSync(join(tmpdir(), "porcupine-user-tools-dup-"));
		writeUserTool(agentDir, {
			name: "t",
			description: "d",
			parameters: {},
			command: "echo hi",
		});
		expect(() =>
			writeUserTool(agentDir, { name: "t", description: "d2", parameters: {}, command: "echo bye" }),
		).toThrow(/already exists/);
		writeUserTool(agentDir, { name: "t", description: "d2", parameters: {}, command: "echo bye" }, { force: true });
		expect(loadUserTools(agentDir)).toHaveLength(1);
	});
});
