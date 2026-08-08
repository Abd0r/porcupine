/**
 * bug-proof-registration.test.ts
 *
 * Proof-of-bug for the tool registration integrity in src/core/tools/index.ts.
 * The invariant every new tool must satisfy: the ToolName is present in BOTH the
 * createToolDefinition switch AND the createTool switch AND allToolNames AND the
 * defs/tools records.
 *
 * Suspected bug: the two single-name switches are asymmetric with each other.
 *  - createToolDefinition switch is MISSING the browser_* cases.
 *  - createTool switch is MISSING the tasks / projects / literature cases.
 */
import { describe, expect, it } from "vitest";
import { allToolNames, createTool, createToolDefinition } from "../src/core/tools/index.ts";

describe("tool registration integrity (proof-of-bug)", () => {
	it("createToolDefinition supports every ToolName in allToolNames", () => {
		// This SHOULD never throw. If createToolDefinition is missing a case it
		// falls to `default: throw new Error('Unknown tool name')`.
		const writers: string[] = [];
		for (const name of allToolNames) {
			try {
				createToolDefinition(name as never, "/tmp");
			} catch (error) {
				writers.push(`${name} -> ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		expect(writers, `createToolDefinition threw for: ${writers.join("; ")}`).toEqual([]);
	});

	it("createTool supports every ToolName in allToolNames", () => {
		const writers: string[] = [];
		for (const name of allToolNames) {
			try {
				createTool(name as never, "/tmp");
			} catch (error) {
				writers.push(`${name} -> ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		expect(writers, `createTool threw for: ${writers.join("; ")}`).toEqual([]);
	});
});
