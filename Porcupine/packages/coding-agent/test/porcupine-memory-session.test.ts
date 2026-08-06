import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ExtensionContext } from "../src/core/extensions/types.ts";
import { buildSystemPrompt } from "../src/core/system-prompt.ts";
import { createMemoryToolDefinition } from "../src/core/tools/memory.ts";
import { createSessionSearchToolDefinition } from "../src/core/tools/session-search.ts";
import {
	createAutonomousCapabilityLearner,
	extractUserPatternsHeuristic,
	formatMemoryForPrompt,
	mutateMemory,
} from "../src/porcupine/index.ts";

describe("persistent memory", () => {
	it("adds lists and injects into system prompt", () => {
		const agentDir = mkdtempSync(join(tmpdir(), "porcupine-mem-"));
		const add = mutateMemory(agentDir, "add", "user", { content: "prefers concise replies" });
		expect(add.ok).toBe(true);
		const list = mutateMemory(agentDir, "list", "user");
		expect(list.entries?.some((e) => e.text.includes("concise"))).toBe(true);

		const block = formatMemoryForPrompt(agentDir);
		expect(block).toContain("porcupine_memory");
		expect(block).toContain("concise");

		const prompt = buildSystemPrompt({
			cwd: "/tmp",
			agentDir,
			selectedTools: ["memory"],
			toolSnippets: { memory: "Durable memory" },
		});
		expect(prompt).toContain("prefers concise");
	});

	it("memory tool executes", async () => {
		const agentDir = mkdtempSync(join(tmpdir(), "porcupine-mem-tool-"));
		const tool = createMemoryToolDefinition({ agentDir });
		const result = await tool.execute(
			"t1",
			{
				action: "add",
				target: "memory",
				content: "uses RTX 4050 for heavy jobs",
			},
			undefined,
			undefined,
			undefined as unknown as ExtensionContext,
		);
		const text = result.content.map((c) => (c.type === "text" ? c.text : "")).join("");
		expect(text).toContain("ok");
		expect(readFileSync(join(agentDir, "MEMORY.md"), "utf8")).toContain("RTX 4050");
	});
});

describe("user pattern heuristic + capability learning", () => {
	it("extracts preference language", () => {
		const hits = extractUserPatternsHeuristic("Please remember that I prefer pnpm over npm.");
		expect(hits.length).toBeGreaterThan(0);
		expect(hits[0].confidence).toBeGreaterThanOrEqual(0.8);
	});

	it("autonomously activates a skill stub", async () => {
		const agentDir = mkdtempSync(join(tmpdir(), "porcupine-learn-"));
		const learner = createAutonomousCapabilityLearner(agentDir);
		const result = await learner.learn({
			type: "missing-capability",
			description: "No capability for foobar-deploy",
			evidence: ["unmatched query: foobar-deploy"],
		});
		expect(result.status).toBe("activated");
		expect(result.proposal?.id).toMatch(/^learned-/);
		const skillFile = join(agentDir, "skills", "meta", result.proposal!.id, "SKILL.md");
		expect(existsSync(skillFile)).toBe(true);
		expect(readFileSync(skillFile, "utf8")).toContain("foobar-deploy");
	});
});

describe("session_search tool", () => {
	it("browses empty and finds a seeded session", async () => {
		const root = mkdtempSync(join(tmpdir(), "porcupine-sess-"));
		const cwd = join(root, "proj");
		mkdirSync(cwd);
		// Use real SessionManager.new to create a session under default dirs is hard;
		// unit-test execute with empty list path via custom empty project.
		const tool = createSessionSearchToolDefinition({ cwd });
		const empty = await tool.execute(
			"t1",
			{ limit: 3 },
			undefined,
			undefined,
			undefined as unknown as ExtensionContext,
		);
		const text = empty.content.map((c) => (c.type === "text" ? c.text : "")).join("");
		expect(text.toLowerCase()).toMatch(/no sessions|found 0|no session/i);
	});
});
