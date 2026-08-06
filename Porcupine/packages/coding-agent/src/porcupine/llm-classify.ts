import type { AssistantMessage, Model } from "@porcupineai/ai";
import type { ModelRuntime } from "../core/model-runtime.ts";

export interface ClassifyLlmOptions {
	modelRuntime: ModelRuntime;
	model: Model<any> | undefined;
	system: string;
	user: string;
	/** Default 24 */
	maxTokens?: number;
	timeoutMs?: number;
}

function extractAssistantText(message: AssistantMessage | undefined): string {
	if (!message) return "";
	const content = message.content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((block) => {
			if (!block || typeof block !== "object") return "";
			if ((block as { type?: string }).type === "text") {
				return String((block as { text?: string }).text ?? "");
			}
			return "";
		})
		.join(" ")
		.trim();
}

/**
 * Tiny one-shot classification call against the active model.
 * Never throws — returns empty string on any failure.
 */
export async function classifyWithSessionModel(options: ClassifyLlmOptions): Promise<string> {
	const { modelRuntime, model, system, user } = options;
	if (!model) return "";

	try {
		const result = await modelRuntime.completeSimple(
			model,
			{
				systemPrompt: system,
				messages: [
					{
						role: "user",
						content: user,
						timestamp: Date.now(),
					},
				],
			},
			{
				// Keep the classify call itself cheap — no thinking tax.
				maxTokens: options.maxTokens ?? 24,
				temperature: 0,
				timeoutMs: options.timeoutMs ?? 25_000,
			},
		);
		return extractAssistantText(result);
	} catch {
		return "";
	}
}
