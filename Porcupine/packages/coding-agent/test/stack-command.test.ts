import { describe, expect, it } from "vitest";
import { parseStackCommandArgs } from "../src/modes/interactive/stack-command.ts";

describe("parseStackCommandArgs", () => {
	it("parses extract-stack positionals and flags", () => {
		const args = parseStackCommandArgs(
			"runbook.md --name deploy --stack shell --tool",
			["name", "stack", "desc"],
			["force", "tool"],
		);
		expect(args.positionals).toEqual(["runbook.md"]);
		expect(args.flags.name).toBe("deploy");
		expect(args.flags.stack).toBe("shell");
		expect(args.flags.tool).toBe("true");
	});

	it("parses craft-stack with --desc", () => {
		const args = parseStackCommandArgs(
			'vite-build --desc "How to configure a production Vite build" --stack build',
			["desc", "stack", "hint"],
			["force", "tool"],
		);
		expect(args.positionals).toEqual(["vite-build"]);
		expect(args.flags.desc).toContain("Vite build");
		expect(args.flags.stack).toBe("build");
	});

	it("throws on a value flag with no value", () => {
		expect(() => parseStackCommandArgs("foo --name", ["name"], [])).toThrow(/requires a value/);
	});

	it("throws on an unknown flag", () => {
		expect(() => parseStackCommandArgs("foo --nope", [], [])).toThrow(/Unknown flag/);
	});

	it("handles empty input", () => {
		const args = parseStackCommandArgs("", ["name"], ["force"]);
		expect(args.positionals).toEqual([]);
		expect(args.flags).toEqual({});
	});
});
