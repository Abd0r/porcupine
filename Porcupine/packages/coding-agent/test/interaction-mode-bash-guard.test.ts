import { describe, expect, it } from "vitest";
import type { ExtensionContext } from "../src/core/extensions/types.ts";
import { createBashToolDefinition } from "../src/core/tools/bash.ts";

describe("bash command guard presentation", () => {
	it("renders an approved Auto badge in the successful command result", async () => {
		const definition = createBashToolDefinition(process.cwd(), {
			commandGuard: async () => ({
				approved: true,
				message: "⚡ Auto → ✅ Approved",
			}),
			operations: {
				exec: async (_command, _cwd, { onData }) => {
					onData(Buffer.from("ok\n"));
					return { exitCode: 0 };
				},
			},
		});

		const result = await definition.execute(
			"call",
			{ command: "echo ok" },
			undefined,
			undefined,
			undefined as unknown as ExtensionContext,
		);
		expect(result.content).toHaveLength(1);
		const content = result.content[0];
		expect(content?.type).toBe("text");
		if (content?.type !== "text") throw new Error("Expected text command output");
		expect(content.text).toContain("⚡ Auto → ✅ Approved");
	});

	it("surfaces a denied Auto decision as a tool error message", async () => {
		const definition = createBashToolDefinition(process.cwd(), {
			commandGuard: async () => ({
				approved: false,
				message: "⚡ Auto → 🛡 Denied (elevated privileges).",
			}),
		});

		await expect(
			definition.execute(
				"call",
				{ command: "sudo whoami" },
				undefined,
				undefined,
				undefined as unknown as ExtensionContext,
			),
		).rejects.toThrow("⚡ Auto → 🛡 Denied (elevated privileges).");
	});
});
