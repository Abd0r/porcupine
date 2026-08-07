import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createShowMarkdownTool } from "../src/core/tools/show-markdown.ts";

describe("show_markdown tool", () => {
	let cwd: string;
	let tool: ReturnType<typeof createShowMarkdownTool>;

	beforeEach(() => {
		cwd = join(tmpdir(), `porcupine-show-md-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(cwd, { recursive: true });
		tool = createShowMarkdownTool(cwd);
	});

	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true });
	});

	it("renders a file path into the markdownViewer details", async () => {
		writeFileSync(join(cwd, "plan.md"), "# Plan\n\nDo the thing.\n");
		const result = await tool.execute("call-1", { path: "plan.md" });
		const first = result.content[0] as { type: "text"; text: string };
		expect(first.text).toContain("Rendered");
		const details = result.details?.markdownViewer;
		expect(details?.title).toBe("plan.md");
		expect(details?.content).toContain("# Plan");
		expect(details?.path).toContain("plan.md");
	});

	it("renders inline content with a custom title", async () => {
		const result = await tool.execute("call-2", { content: "## Report\nline two", title: "Weekly report" });
		const details = result.details?.markdownViewer;
		expect(details?.title).toBe("Weekly report");
		expect(details?.content).toContain("## Report");
	});

	it("returns a readable error for a missing file", async () => {
		await expect(tool.execute("call-3", { path: "nope.md" })).rejects.toThrow();
	});

	it("requires path or content", async () => {
		await expect(tool.execute("call-4", {})).rejects.toThrow(/path.*content|content.*path/);
	});
});
