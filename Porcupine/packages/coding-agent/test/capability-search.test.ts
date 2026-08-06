import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ExtensionContext } from "../src/core/extensions/types.ts";
import { createCapabilitySearchToolDefinition } from "../src/core/tools/capability-search.ts";
import { createAllToolDefinitions } from "../src/core/tools/index.ts";

function asText(result: { content: Array<{ type: string; text?: string }> }): string {
	return result.content.map((item) => (item.type === "text" ? (item.text ?? "") : "")).join("");
}

describe("capability_search tool", () => {
	it("lists the complete built-in tool menu", async () => {
		const root = mkdtempSync(join(tmpdir(), "porcupine-capability-"));
		const tool = createCapabilitySearchToolDefinition({
			cwd: root,
			agentDir: root,
			getTools: () => Object.values(createAllToolDefinitions(root, { capability_search: { agentDir: root } })),
		});
		const result = await tool.execute("t1", { action: "list" }, undefined, undefined, {} as ExtensionContext);
		const text = asText(result);
		expect(text).toContain("Porcupine capability catalog");
		expect(text).toContain("capability_search");
		expect(text).toContain("web_search");
	});

	it("searches tools and loads only a selected skill", async () => {
		const root = mkdtempSync(join(tmpdir(), "porcupine-capability-"));
		const skills = join(root, "skills", "vcs", "github-demo");
		await import("node:fs/promises").then(({ mkdir, writeFile }) =>
			mkdir(skills, { recursive: true }).then(() =>
				writeFile(
					join(skills, "SKILL.md"),
					"---\nname: github-demo\ndescription: GitHub demonstration workflow.\nstack: vcs\n---\n\n# Demo\n\nUse gh safely.\n",
				),
			),
		);
		const tool = createCapabilitySearchToolDefinition({
			cwd: root,
			agentDir: root,
			getTools: () => Object.values(createAllToolDefinitions(root, { capability_search: { agentDir: root } })),
		});
		const search = await tool.execute(
			"t2",
			{ action: "search", query: "github", kind: "skill" },
			undefined,
			undefined,
			{} as ExtensionContext,
		);
		expect(asText(search)).toContain("github-demo");
		const view = await tool.execute(
			"t3",
			{ action: "view", query: "github-demo" },
			undefined,
			undefined,
			{} as ExtensionContext,
		);
		expect(asText(view)).toContain('<skill name="github-demo"');
		expect(asText(view)).toContain("Use gh safely.");
	});

	it("searches and views bundled product skills shipped with Porcupine", async () => {
		const root = mkdtempSync(join(tmpdir(), "porcupine-capability-bundled-"));
		const tool = createCapabilitySearchToolDefinition({
			cwd: root,
			agentDir: root,
			getTools: () => Object.values(createAllToolDefinitions(root, { capability_search: { agentDir: root } })),
		});

		const search = await tool.execute(
			"t2",
			{ action: "search", query: "durable evidence-backed project workspace", kind: "skill" },
			undefined,
			undefined,
			{} as ExtensionContext,
		);
		expect(asText(search)).toContain("project-hygiene");

		const view = await tool.execute(
			"t3",
			{ action: "view", query: "project-hygiene" },
			undefined,
			undefined,
			{} as ExtensionContext,
		);
		expect(asText(view)).toContain("durable, evidence-backed project workspace");
	});
});
