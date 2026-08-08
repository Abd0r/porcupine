import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli/args.ts";

/**
 * Part-D deep review repro (fixed): cli/args.ts parsing edge cases.
 * Fixed: --flag=value works for known flags, invalid/missing values emit
 * error diagnostics instead of being silently ignored.
 */
describe("args.ts parsing edge cases", () => {
	it("accepts --flag=value for value flags", () => {
		const parsed = parseArgs(["--provider=openai", "--model=gpt-4o", "--session-dir=/x", "--port=8123"]);
		expect(parsed.provider).toBe("openai");
		expect(parsed.model).toBe("gpt-4o");
		expect(parsed.sessionDir).toBe("/x");
		expect(parsed.port).toBe(8123);
		expect(parsed.diagnostics).toHaveLength(0);
	});

	it("--mode with an invalid value emits an error diagnostic", () => {
		const parsed = parseArgs(["--mode", "banana", "hello"]);
		expect(parsed.mode).toBeUndefined();
		expect(parsed.diagnostics.some((d) => d.type === "error" && d.message.includes("Invalid mode"))).toBe(true);
		expect(parsed.messages).toEqual(["hello"]);
	});

	it("--port with a missing value emits an error diagnostic", () => {
		const parsed = parseArgs(["--port"]);
		expect(parsed.port).toBeUndefined();
		expect(parsed.diagnostics.some((d) => d.type === "error" && d.message.includes("--port requires a value"))).toBe(
			true,
		);
	});

	it("--mode with a missing value emits an error diagnostic", () => {
		const parsed = parseArgs(["--mode"]);
		expect(parsed.diagnostics.some((d) => d.type === "error")).toBe(true);
	});

	it("unknown single-dash short flags emit an error diagnostic", () => {
		const parsed = parseArgs(["-zzz"]);
		expect(parsed.diagnostics.some((d) => d.type === "error")).toBe(true);
	});

	it("--print does not consume a following flag", () => {
		const parsed = parseArgs(["--print", "--headless", "do it"]);
		expect(parsed.print).toBe(true);
		expect(parsed.headless).toBe(true);
		expect(parsed.messages).toEqual(["do it"]);
	});

	it("unknown --flag=value keeps its value in unknownFlags", () => {
		const parsed = parseArgs(["--custom-flag=hello"]);
		expect(parsed.unknownFlags.get("custom-flag")).toBe("hello");
	});
});
