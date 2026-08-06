import { describe, expect, it } from "vitest";
import { type McpResourceInfo, sanitizeToolDescription } from "../src/core/mcp/backend.ts";
import {
	formatResourceContext,
	mapPromptInfo,
	mapPromptMessages,
	mapResourceInfo,
	mapResourceReadText,
	promptSlashCommandName,
} from "../src/core/mcp/resources.ts";

describe("MCP resource mapping", () => {
	it("maps a resource list entry to a stable summary", () => {
		const info = mapResourceInfo({ uri: "file:///a.md", name: "a", description: "docs" });
		expect(info?.uri).toBe("file:///a.md");
		expect(info?.name).toBe("a");
		expect(info?.description).toContain("advisory");
	});

	it("drops invalid resource entries", () => {
		expect(mapResourceInfo(undefined)).toBeUndefined();
		expect(mapResourceInfo({ uri: 42 as never, name: "x" })).toBeUndefined();
	});

	it("flattens read-result contents into text, reducing binary blobs", () => {
		const text = mapResourceReadText([
			{ uri: "file:///a.md", text: "hello" },
			{ uri: "file:///b.png", blob: "aGk=", mimeType: "image/png" },
		]);
		expect(text).toContain("hello");
		expect(text).toContain("binary resource");
	});

	it("formats a resource context block", () => {
		const resources: McpResourceInfo[] = [
			{ uri: "file:///a", name: "a" },
			{ uri: "file:///b", name: "b" },
		];
		const formatted = formatResourceContext(resources);
		expect(formatted).toContain("MCP resources:");
		expect(formatted).toContain("file:///a");
		expect(formatted).toContain("(b)");
	});
});

describe("MCP prompt mapping", () => {
	it("maps a prompt listing, cloning argument metadata", () => {
		const info = mapPromptInfo({
			name: "review",
			description: "run review",
			arguments: [{ name: "path", required: true }],
		});
		expect(info?.name).toBe("review");
		expect(info?.arguments?.[0]?.required).toBe(true);
	});

	it("extracts resolved prompt text from messages", () => {
		const msgs = mapPromptMessages([
			{ role: "user", content: [{ type: "text", text: "hi" }] },
			{ role: "assistant", content: [{ type: "text", text: "there" }] },
		]);
		expect(msgs).toHaveLength(2);
		expect(msgs[0].content.text).toBe("hi");
		expect(msgs[1].role).toBe("assistant");
	});

	it("namespaced slash-command name keeps server + prompt distinct", () => {
		expect(promptSlashCommandName("sentry", "review")).toBe("mcpp:sentry:review");
	});
});

describe("MCP description trimming reuse", () => {
	it("sanitizeToolDescription clips untrusted prompt/resource descriptions", () => {
		const cleaned = sanitizeToolDescription("x".repeat(3000));
		expect(cleaned.length).toBeLessThan(1500);
		expect(cleaned).toContain("advisory");
	});
});
