import { describe, expect, it, vi } from "vitest";
import type { ExtensionContext, ExtensionUIContext } from "../src/core/extensions/types.ts";
import { createAskQuestionToolDefinition } from "../src/core/tools/ask-question.ts";
import { createAllToolDefinitions } from "../src/core/tools/index.ts";

const context = (overrides: Omit<Partial<ExtensionContext>, "ui"> & { ui?: Partial<ExtensionUIContext> } = {}) =>
	({ mode: "tui" as const, hasUI: true, ...overrides }) as unknown as ExtensionContext;

function text(result: { content: Array<{ type: string; text?: string }> }): string {
	return result.content.find((item) => item.type === "text")?.text ?? "";
}

describe("ask_question tool", () => {
	it("is available in the built-in catalog", () => {
		expect(createAllToolDefinitions(process.cwd())).toHaveProperty("ask_question");
	});

	it("returns a safe explanation when interactive UI is unavailable", async () => {
		const tool = createAskQuestionToolDefinition();
		const result = await tool.execute(
			"call",
			{ question: "Continue?" },
			undefined,
			undefined,
			context({ hasUI: false }),
		);
		expect(text(result)).toContain("interactive UI is unavailable");
		expect(result.details).toMatchObject({ answer: null, cancelled: false });
	});

	it("returns a selected option", async () => {
		const select = vi.fn().mockResolvedValue("Use SQLite — Local and simple");
		const tool = createAskQuestionToolDefinition();
		const result = await tool.execute(
			"call",
			{ question: "Which database?", options: [{ label: "Use SQLite", description: "Local and simple" }] },
			undefined,
			undefined,
			context({ ui: { select, input: vi.fn() } }),
		);
		expect(select).toHaveBeenCalledWith(
			"Which database?",
			["Use SQLite — Local and simple", "Other (type a custom answer)"],
			expect.anything(),
		);
		expect(text(result)).toBe("User selected: Use SQLite");
		expect(result.details).toMatchObject({ answer: "Use SQLite", custom: false });
	});

	it("supports a custom answer", async () => {
		const input = vi.fn().mockResolvedValue("My own answer");
		const tool = createAskQuestionToolDefinition();
		const result = await tool.execute(
			"call",
			{ question: "What should we call it?", options: [{ label: "Default" }] },
			undefined,
			undefined,
			context({ ui: { select: vi.fn().mockResolvedValue("Other (type a custom answer)"), input } }),
		);
		expect(input).toHaveBeenCalledWith("What should we call it?", undefined, expect.anything());
		expect(result.details).toMatchObject({ answer: "My own answer", custom: true });
	});

	it("maps the selected rendered option back to its clean label", async () => {
		// Descriptions render as "label — description" in the dialog; the answer
		// returned to the model must be the clean label, not the rendered form.
		const select = vi.fn().mockResolvedValue("Use SQLite — Local and simple");
		const tool = createAskQuestionToolDefinition();
		const result = await tool.execute(
			"call",
			{
				question: "Which database?",
				options: [{ label: "Use SQLite", description: "Local and simple" }, { label: "Use Postgres" }],
			},
			undefined,
			undefined,
			context({ ui: { select, input: vi.fn() } }),
		);
		expect(result.details).toMatchObject({ answer: "Use SQLite" });
	});

	it("sanitizes newlines out of the question for dialog display", async () => {
		const select = vi.fn().mockResolvedValue("Yes");
		const tool = createAskQuestionToolDefinition();
		const result = await tool.execute(
			"call",
			{ question: "Continue?\nThis is a follow-up", options: [{ label: "Yes" }, { label: "No" }] },
			undefined,
			undefined,
			context({ ui: { select, input: vi.fn() } }),
		);
		expect(select).toHaveBeenCalledWith("Continue? This is a follow-up", expect.anything(), expect.anything());
		expect(result.details).toMatchObject({ question: "Continue? This is a follow-up" });
	});

	it("caps long custom answers before returning them to the model", async () => {
		const input = vi.fn().mockResolvedValue("x".repeat(5000));
		const tool = createAskQuestionToolDefinition();
		const result = await tool.execute(
			"call",
			{ question: "Elaborate?" },
			undefined,
			undefined,
			context({ ui: { select: vi.fn(), input } }),
		);
		expect(result.details?.answer).toHaveLength(2000);
	});

	it("times out instead of cancelling when the user does not answer", async () => {
		// A never-resolving dialog simulates the user walking away. The timeout
		// result must be distinguishable from a cancel: the model may re-ask or
		// keep working instead of treating it as a refusal.
		const never = () => new Promise<string | undefined>(() => {});
		const tool = createAskQuestionToolDefinition({ timeoutMs: 30 });
		const result = await tool.execute(
			"call",
			{ question: "Proceed?", options: [{ label: "Yes" }, { label: "No" }] },
			undefined,
			undefined,
			context({ ui: { select: never, input: vi.fn() } }),
		);
		expect(result.details).toMatchObject({ timedOut: true, cancelled: false, answer: null });
		expect(JSON.stringify(result.content)).toContain("did not answer");
	});

	it("applies the timeout to free-text questions as well", async () => {
		const never = () => new Promise<string | undefined>(() => {});
		const tool = createAskQuestionToolDefinition({ timeoutMs: 30 });
		const result = await tool.execute(
			"call",
			{ question: "Any notes?" },
			undefined,
			undefined,
			context({ ui: { select: vi.fn(), input: never } }),
		);
		expect(result.details).toMatchObject({ timedOut: true });
	});

	it("an answer that arrives before the timeout still wins the race", async () => {
		const select = vi.fn().mockResolvedValue("Yes");
		const tool = createAskQuestionToolDefinition({ timeoutMs: 30 });
		const result = await tool.execute(
			"call",
			{ question: "Proceed?", options: [{ label: "Yes" }, { label: "No" }] },
			undefined,
			undefined,
			context({ ui: { select, input: vi.fn() } }),
		);
		expect(result.details).toMatchObject({ answer: "Yes" });
		expect(result.details?.timedOut).toBeUndefined();
	});
});
