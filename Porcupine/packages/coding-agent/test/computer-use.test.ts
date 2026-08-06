import { describe, expect, it } from "vitest";
import type { ExtensionContext } from "../src/core/extensions/types.ts";
import { createComputerUseToolDefinition } from "../src/core/tools/computer-use.ts";
import { createAllToolDefinitions } from "../src/core/tools/index.ts";

describe("computer_use tool", () => {
	it("is registered in the complete built-in catalog", () => {
		expect(createAllToolDefinitions(process.cwd())).toHaveProperty("computer_use");
	});

	it("requires a real interactive confirmation context before input", async () => {
		const tool = createComputerUseToolDefinition();
		const result = await tool.execute(
			"call",
			{ action: "key", key: "enter" },
			undefined,
			undefined,
			undefined as unknown as ExtensionContext,
		);
		const text = result.content.find((item) => item.type === "text")?.text ?? "";
		expect(text).toContain("no interactive confirmation UI");
	});
});
