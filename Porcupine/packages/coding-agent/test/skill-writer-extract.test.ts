import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	deriveDescriptionFromText,
	detectKindFromText,
	distillToSkillBody,
	extractSkillFromDocument,
} from "../src/porcupine/skill-extract.ts";
import { writeSkill } from "../src/porcupine/skill-writer.ts";

// Simulate a machine without pdftotext for the PDF path.
vi.mock("node:child_process", () => {
	const enoent = Object.assign(new Error("spawn pdftotext ENOENT"), { code: "ENOENT" });
	return {
		execFile: vi.fn().mockImplementation((_cmd, _args, _opts, cb: (err?: Error, stdout?: string) => void) => {
			cb(enoent);
		}),
	};
});

beforeEach(() => {
	vi.clearAllMocks();
});

describe("skill-writer", () => {
	it("writes SKILL.md with proper frontmatter", () => {
		const agentDir = mkdtempSync(join(tmpdir(), "porcupine-skill-writer-"));
		const result = writeSkill(agentDir, {
			stack: "web",
			name: "my-search",
			description: "Search the web",
			content: "# My Search\n\n## Procedure\n\n1. Step one.",
		});
		expect(result.path).toBe(join(agentDir, "skills", "web", "my-search", "SKILL.md"));
		expect(existsSync(result.path)).toBe(true);
		const text = readFileSync(result.path, "utf-8");
		expect(text).toContain("name: my-search");
		expect(text).toContain("stack: web");
		expect(text).toContain("description: Search the web");
	});

	it("validates stack and name", () => {
		const agentDir = mkdtempSync(join(tmpdir(), "porcupine-skill-validate-"));
		expect(() => writeSkill(agentDir, { stack: "BadStack", name: "ok", description: "d", content: "x" })).toThrow(
			/Invalid stack/,
		);
		expect(() => writeSkill(agentDir, { stack: "web", name: "Bad Name!", description: "d", content: "x" })).toThrow(
			/Invalid name/,
		);
		expect(() => writeSkill(agentDir, { stack: "web", name: "ok", description: "  ", content: "x" })).toThrow(
			/description is required/,
		);
	});

	it("refuses to overwrite an existing skill without force", () => {
		const agentDir = mkdtempSync(join(tmpdir(), "porcupine-skill-overwrite-"));
		writeSkill(agentDir, { stack: "web", name: "dup", description: "d", content: "one" });
		expect(() => writeSkill(agentDir, { stack: "web", name: "dup", description: "d", content: "two" })).toThrow(
			/already exists/,
		);
		// force overwrites
		writeSkill(agentDir, { stack: "web", name: "dup", description: "d", content: "two" }, { force: true });
		expect(readFileSync(join(agentDir, "skills", "web", "dup", "SKILL.md"), "utf8")).toContain("two");
	});
});

describe("skill-extract", () => {
	it("distills a markdown doc into a body containing a Procedure", async () => {
		const agentDir = mkdtempSync(join(tmpdir(), "porcupine-extract-md-"));
		const doc = join(agentDir, "guide.md");
		writeFileSync(
			doc,
			["# Deployment Guide", "", "- Install dependencies", "- Run the build", "- Deploy to production"].join("\n"),
			"utf8",
		);
		const result = await extractSkillFromDocument(agentDir, {
			path: doc,
			stack: "shell",
			name: "deploy",
			kind: "skill",
		});
		expect(result.kind).toBe("skill");
		const text = readFileSync(result.path, "utf-8");
		expect(text).toContain("## Procedure");
		expect(text).toContain("Install dependencies");
	});

	it("returns a clean error when pdftotext is missing (ENOENT)", async () => {
		const agentDir = mkdtempSync(join(tmpdir(), "porcupine-extract-pdf-"));
		const doc = join(agentDir, "paper.pdf");
		writeFileSync(doc, "%PDF-1.4 fake", "utf8");
		await expect(extractSkillFromDocument(agentDir, { path: doc, stack: "sci", name: "paper" })).rejects.toThrow(
			/pdftotext is not installed/,
		);
	});

	it("detects a command-oriented doc as a tool", () => {
		expect(detectKindFromText("run the deployment", "npm install && npm run build")).toBe("tool");
		expect(detectKindFromText("a research summary", "the paper concludes")).toBe("skill");
	});

	it("derives a description from the first non-empty line", () => {
		expect(deriveDescriptionFromText("# Title\n\nReal description here.")).toContain("Real description here");
	});

	it("extracts a tool record to user-tools.json for kind:tool", async () => {
		const agentDir = mkdtempSync(join(tmpdir(), "porcupine-extract-tool-"));
		const doc = join(agentDir, "runbook.md");
		writeFileSync(doc, "# Runbook\n\n- npm install\n- npm test\n", "utf8");
		const result = await extractSkillFromDocument(agentDir, {
			path: doc,
			stack: "shell",
			name: "myrun",
			description: "run the test suite",
			kind: "tool",
		});
		expect(result.kind).toBe("tool");
		expect(result.path).toContain("user-tools.json");
		expect(readFileSync(result.path, "utf8")).toContain("myrun");
	});
});

describe("distillToSkillBody helper", () => {
	it("produces the canonical section headings", () => {
		const body = distillToSkillBody("# Guide\n\n- First\n- Second\n");
		expect(body).toContain("# Guide");
		expect(body).toContain("## When to Use");
		expect(body).toContain("## Procedure");
		expect(body).toContain("## Pitfalls");
	});
});
