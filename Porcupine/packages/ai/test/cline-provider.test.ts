import { describe, expect, it } from "vitest";
import { CLINE_MODELS, clineProvider } from "../src/providers/cline.ts";

describe("cline provider", () => {
	it("registers under the Cline API base URL", () => {
		const provider = clineProvider();
		expect(provider.id).toBe("cline");
		expect(provider.name).toBe("Cline API");
		expect(provider.auth).toBeDefined();
		for (const model of CLINE_MODELS) {
			expect(model.baseUrl).toBe("https://api.cline.bot");
			expect(model.api).toBe("openai-completions");
			expect(model.cost).toBeDefined();
		}
	});

	it("exposes the documented Cline models", () => {
		const ids = CLINE_MODELS.map((model) => model.id);
		expect(ids).toContain("anthropic/claude-sonnet-4-6");
		expect(ids).toContain("openai/gpt-4o");
		expect(ids).toContain("google/gemini-2.5-pro");
		expect(ids).toContain("deepseek/deepseek-chat");
		expect(ids).toContain("deepseek/deepseek-v4-flash");
		expect(ids).toContain("minimax/minimax-m2.5");
	});

	it("flags reasoning models", () => {
		const sonnet = CLINE_MODELS.find((model) => model.id === "anthropic/claude-sonnet-4-6");
		expect(sonnet?.reasoning).toBe(true);
		const gpt4o = CLINE_MODELS.find((model) => model.id === "openai/gpt-4o");
		expect(gpt4o?.reasoning).toBe(false);
	});
});
