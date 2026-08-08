import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { craftSkill } from "../src/porcupine/skill-craft.ts";

// Mock the free web search + extraction so tests run offline/deterministically.
vi.mock("../src/core/tools/web-search.ts", () => ({
	runFreeWebSearch: vi.fn().mockResolvedValue({
		hits: [
			{ title: "Source One", url: "https://example.com/one", snippet: "snippet one", backend: "searxng" },
			{ title: "Source Two", url: "https://example.com/two", snippet: "snippet two", backend: "searxng" },
		],
		backend: "searxng",
		tried: ["searxng"],
		skipped: [],
	}),
}));

vi.mock("../src/core/tools/web-extract.ts", () => ({
	extractUrl: vi.fn().mockResolvedValue({
		text: "extracted page one content.\ninstall the cli\nrun the command",
		details: { url: "https://example.com/one" },
	}),
}));

import { extractUrl } from "../src/core/tools/web-extract.ts";
import { runFreeWebSearch } from "../src/core/tools/web-search.ts";

describe("skill-craft", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("writes a skill from pre-gathered notes (no web search)", async () => {
		const agentDir = mkdtempSync(join(tmpdir(), "porcupine-craft-notes-"));
		const result = await craftSkill(agentDir, {
			name: "staging",
			description: "Deploy to staging safely",
			stack: "shell",
			notes: [
				{ title: "Staging Docs", url: "https://example.com/staging", keyPoints: "use the CLI, verify health" },
			],
		});
		expect(result.kind).toBe("skill");
		expect(existsSync(result.path)).toBe(true);
		const text = readFileSync(result.path, "utf-8");
		expect(text).toContain("## Procedure");
		expect(text).toContain("## Sources");
		expect(text).toContain("https://example.com/staging");
		expect(runFreeWebSearch).not.toHaveBeenCalled();
	});

	it("deep-researches with web search when no notes are passed", async () => {
		const agentDir = mkdtempSync(join(tmpdir(), "porcupine-craft-search-"));
		const result = await craftSkill(agentDir, {
			name: "webcheck",
			description: "Verify a website is up",
			stack: "web",
		});
		expect(result.sources.length).toBeGreaterThan(0);
		expect(runFreeWebSearch).toHaveBeenCalled();
		expect(extractUrl).toHaveBeenCalled();
		expect(existsSync(result.path)).toBe(true);
	});

	it("writes a tool record for kind:tool", async () => {
		const agentDir = mkdtempSync(join(tmpdir(), "porcupine-craft-tool-"));
		const result = await craftSkill(agentDir, {
			name: "deploynow",
			description: "Run the deploy command",
			researchHint: "npm run deploy",
			kind: "tool",
			notes: [{ title: "S", url: "https://example.com", keyPoints: "k" }],
		});
		expect(result.kind).toBe("tool");
		expect(result.path).toContain("user-tools.json");
		expect(readFileSync(result.path, "utf8")).toContain("deploynow");
	});
});
