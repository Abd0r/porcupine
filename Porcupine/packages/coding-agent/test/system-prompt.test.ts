import { describe, expect, test } from "vitest";
import { createSyntheticSourceInfo } from "../src/core/source-info.ts";
import { buildSystemPrompt } from "../src/core/system-prompt.ts";

describe("buildSystemPrompt", () => {
	describe("empty tools", () => {
		test("shows (none) for empty tools list", () => {
			const prompt = buildSystemPrompt({
				selectedTools: [],
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("Available tools:\n(none)");
		});

		test("shows file paths guideline even with no tools", () => {
			const prompt = buildSystemPrompt({
				selectedTools: [],
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("Show file paths clearly");
		});
	});

	describe("default tools", () => {
		test("includes all default tools when snippets are provided", () => {
			const prompt = buildSystemPrompt({
				toolSnippets: {
					read: "Read file contents",
					bash: "Execute bash commands",
					edit: "Make surgical edits",
					write: "Create or overwrite files",
				},
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("- read:");
			expect(prompt).toContain("- bash:");
			expect(prompt).toContain("- edit:");
			expect(prompt).toContain("- write:");
		});

		test("instructs models to resolve Porcupine docs and includes session-start date/time", () => {
			const prompt = buildSystemPrompt({
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
				skipMemory: true,
			});

			expect(prompt).toContain(
				"- When reading product docs or examples, resolve docs/... under Additional docs and examples/... under Examples, not the current working directory",
			);
			expect(prompt).toContain("environment variables (docs/environment-variables.md)");
			// Date/time is session-start context only (not every user turn).
			expect(prompt).toMatch(/Current date\/time: .+/);
			expect(prompt).toContain(`Current working directory: ${process.cwd().replace(/\\/g, "/")}`);
		});

		test("after compaction uses skills stub instead of full catalog", () => {
			const skills = [
				{
					name: "huge-skill",
					description: "Should not appear in stub mode",
					filePath: "/tmp/huge/SKILL.md",
					baseDir: "/tmp/huge",
					sourceInfo: createSyntheticSourceInfo("/tmp/huge/SKILL.md", {
						source: "user",
						baseDir: "/tmp/huge",
					}),
					disableModelInvocation: false,
				},
			];
			const full = buildSystemPrompt({
				skills,
				selectedTools: ["read"],
				toolSnippets: { read: "Read files" },
				contextFiles: [],
				cwd: process.cwd(),
				skipMemory: true,
				includeSkillsCatalog: true,
			});
			const stub = buildSystemPrompt({
				skills,
				selectedTools: ["read"],
				toolSnippets: { read: "Read files" },
				contextFiles: [],
				cwd: process.cwd(),
				skipMemory: true,
				includeSkillsCatalog: false,
			});

			expect(full).toContain("<available_skills>");
			expect(full).toContain("huge-skill");
			expect(stub).not.toContain("<available_skills>");
			expect(stub).not.toContain("huge-skill");
			expect(stub).toContain("omitted after context compaction");
			expect(stub).toContain("/skill:name");
		});
	});

	describe("custom tool snippets", () => {
		test("includes custom tools in available tools section when promptSnippet is provided", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "dynamic_tool"],
				toolSnippets: {
					dynamic_tool: "Run dynamic test behavior",
				},
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("- dynamic_tool: Run dynamic test behavior");
		});

		test("omits custom tools from available tools section when promptSnippet is not provided", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "dynamic_tool"],
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).not.toContain("dynamic_tool");
		});
	});

	describe("prompt guidelines", () => {
		test("appends promptGuidelines to default guidelines", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "dynamic_tool"],
				promptGuidelines: ["Use dynamic_tool for project summaries."],
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("- Use dynamic_tool for project summaries.");
		});

		test("deduplicates and trims promptGuidelines", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "dynamic_tool"],
				promptGuidelines: ["Use dynamic_tool for summaries.", "  Use dynamic_tool for summaries.  ", "   "],
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt.match(/- Use dynamic_tool for summaries\./g)).toHaveLength(1);
		});
	});
});
