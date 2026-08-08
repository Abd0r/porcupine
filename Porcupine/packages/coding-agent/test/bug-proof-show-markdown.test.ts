/**
 * bug-proof-show-markdown.test.ts
 *
 * Proof-of-bug in src/core/tools/show-markdown.ts: the 200KiB file-size guard
 * (SHOW_MARKDOWN_MAX_BYTES) is only enforced on the `path` branch, NOT the
 * `content` branch. Passing ~500KiB of inline `content` bypasses the cap that
 * /view and the path form enforce, so an oversized document still opens in the
 * full-screen viewer and consumes unbounded memory/rendering time.
 */
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createShowMarkdownToolDefinition, SHOW_MARKDOWN_MAX_BYTES } from "../src/core/tools/show-markdown.ts";

describe("show_markdown content-size bypass (proof-of-bug)", () => {
	it("rejects a path whose file exceeds SHOW_MARKDOWN_MAX_BYTES", async () => {
		const dir = join(tmpdir(), `md-${Date.now()}`);
		const big = join(dir, "big.md");
		import("node:fs").then((fs) => fs.mkdirSync(dir, { recursive: true }));
		import("node:fs").then((fs) => fs.writeFileSync(big, "x".repeat(SHOW_MARKDOWN_MAX_BYTES + 1)));
		const tool = createShowMarkdownToolDefinition(process.cwd());
		const result = await tool.execute("c1", { path: big }, undefined, undefined, undefined as never).catch((e) => e);
		expect(!!result.error || result instanceof Error).toBe(true);
	});

	it("FIXED: same bytes via content are now rejected (no cap bypass)", async () => {
		const tool = createShowMarkdownToolDefinition(process.cwd());
		const oversized = `# big\n${"y".repeat(SHOW_MARKDOWN_MAX_BYTES * 2)}`;
		// The content branch must apply the same byte cap as the path branch: an
		// oversized inline document is refused instead of opening in the viewer.
		const result = await tool
			.execute("c1", { content: oversized }, undefined, undefined, undefined as never)
			.catch((e) => e);
		expect(!!result.error || result instanceof Error).toBe(true);
	});
});
