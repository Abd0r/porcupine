import { Type } from "typebox";
import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import {
	mapMcpCallResult,
	sanitizeToolDescription,
	translateSchema,
	UnsupportedSchemaError,
} from "../src/core/mcp/backend.ts";
import { MCP_TOOL_MAX_DESCRIPTION } from "../src/core/mcp/types.ts";

describe("MCP JSON Schema → TypeBox", () => {
	it("translates an object schema with typed properties", () => {
		const schema = translateSchema({
			type: "object",
			properties: {
				path: { type: "string", description: "file path" },
				count: { type: "integer", minimum: 0 },
			},
			required: ["path"],
		});
		expect(Value.Check(schema, { path: "/tmp/x" })).toBe(true);
		expect(Value.Check(schema, { path: "/tmp/x", count: 3 })).toBe(true);
		expect(Value.Check(schema, { count: 3 })).toBe(false); // path required
	});

	it("rejects composition keywords in v1 (fail-on-unsupported-schema)", () => {
		expect(() => translateSchema({ type: "object", properties: {}, $ref: "#/definitions/X" })).toThrow(
			UnsupportedSchemaError,
		);
		expect(() => translateSchema({ allOf: [{ type: "string" }] })).toThrow(UnsupportedSchemaError);
	});

	it("falls back to Any() for empty/invalid schemas", () => {
		expect(Value.Check(translateSchema(undefined), 42)).toBe(true);
		expect(Value.Check(translateSchema({}), 42)).toBe(true);
	});

	it("handles string enums", () => {
		const schema = translateSchema({ type: "string", enum: ["a", "b"] });
		expect(Value.Check(schema, "a")).toBe(true);
		expect(Value.Check(schema, "c")).toBe(false);
	});

	it("is composable with TypeBox types directly", () => {
		const schema = Type.Object({ x: translateSchema({ type: "number" }) });
		expect(Value.Check(schema, { x: 1.5 })).toBe(true);
		expect(Value.Check(schema, { x: "nope" })).toBe(false);
	});
});

describe("MCP result mapping", () => {
	it("maps text + image + resource content into agent tool results", () => {
		const result = mapMcpCallResult(
			{
				content: [
					{ type: "text", text: "hello" },
					{ type: "image", data: "aGk=", mimeType: "image/png" },
					{ type: "resource", resource: { uri: "file:///x", text: "resource text" } },
				],
			} as never,
			"fs",
			{},
		);
		const text = result.content
			.filter((block) => block.type === "text")
			.map((b) => (b as { text?: string }).text ?? "");
		expect(text.join(" ")).toContain("hello");
		expect(text.join(" ")).toContain("resource text");
		expect(result.content.some((block) => block.type === "image")).toBe(true);
	});

	it("sanitizes oversized tool descriptions", () => {
		const long = "x".repeat(MCP_TOOL_MAX_DESCRIPTION * 2);
		const cleaned = sanitizeToolDescription(long);
		// Clipped to the max body length (suffix adds the untrusted-advisory tag).
		expect(cleaned.length).toBeLessThan(long.length);
		expect(cleaned.startsWith("x".repeat(MCP_TOOL_MAX_DESCRIPTION))).toBe(true);
	});
});
