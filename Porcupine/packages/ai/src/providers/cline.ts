import { openAICompletionsApi } from "../api/openai-completions.lazy.ts";
import type { ApiKeyAuth } from "../auth/types.ts";
import { createProvider, type Provider } from "../models.ts";
import type { Model, ProviderId } from "../types.ts";

const CLINE_AUTH_URL = "https://app.cline.bot";
const CLINE_ENV = ["CLINE_API_KEY"] as const;

/**
 * Cline API: one OpenAI-compatible endpoint (api.cline.bot) with a single
 * Cline API key for Anthropic, OpenAI, Google and more models
 * (provider/model-name ids, OpenRouter convention). Key from app.cline.bot
 * (Settings > API Keys). See docs/providers.md.
 */
function clineApiKeyAuth(): ApiKeyAuth {
	return {
		name: "Cline API key",
		login: async (interaction) => {
			interaction.notify({
				type: "info",
				message: `Cline API: create an API key at ${CLINE_AUTH_URL} (Settings > API Keys), then paste it.`,
			});
			const key = await interaction.prompt({
				type: "secret",
				message: "Enter your Cline API key",
			});
			return { type: "api_key", key };
		},
		resolve: async ({ ctx, credential }) => {
			if (credential?.key) {
				return { auth: { apiKey: credential.key }, env: credential.env, source: "stored credential" };
			}
			for (const envVar of CLINE_ENV) {
				const value = await ctx.env(envVar);
				if (value) return { auth: { apiKey: value }, source: envVar };
			}
			return undefined;
		},
	};
}

const CLINE_BASE_URL = "https://api.cline.bot";
const PROVIDER: ProviderId = "cline";

function clineModel(
	id: string,
	name: string,
	options: {
		reasoning?: boolean;
		input?: ("text" | "image")[];
		cost: { input: number; output: number; cacheRead?: number; cacheWrite?: number };
		contextWindow: number;
		maxTokens: number;
	},
): Model<"openai-completions"> {
	return {
		id,
		name,
		api: "openai-completions",
		provider: PROVIDER,
		baseUrl: CLINE_BASE_URL,
		reasoning: options.reasoning ?? false,
		input: options.input ?? ["text"],
		cost: {
			input: options.cost.input,
			output: options.cost.output,
			cacheRead: options.cost.cacheRead ?? 0,
			cacheWrite: options.cost.cacheWrite ?? 0,
		},
		contextWindow: options.contextWindow,
		maxTokens: options.maxTokens,
		compat: {
			supportsStore: false,
			supportsDeveloperRole: false,
			supportsReasoningEffort: false,
			maxTokensField: "max_tokens",
			supportsStrictMode: false,
			supportsLongCacheRetention: false,
		},
	};
}

/** Cline API models (provider/model-name ids, OpenRouter convention). */
export const CLINE_MODELS: Model<"openai-completions">[] = [
	clineModel("anthropic/claude-sonnet-4-6", "Claude Sonnet 4.6 (Cline)", {
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
		contextWindow: 200000,
		maxTokens: 64000,
	}),
	clineModel("openai/gpt-4o", "GPT-4o (Cline)", {
		input: ["text", "image"],
		cost: { input: 2.5, output: 10, cacheRead: 1.25, cacheWrite: 0 },
		contextWindow: 128000,
		maxTokens: 16384,
	}),
	clineModel("google/gemini-2.5-pro", "Gemini 2.5 Pro (Cline)", {
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 1.25, output: 10, cacheRead: 0.06, cacheWrite: 2.5 },
		contextWindow: 1000000,
		maxTokens: 65536,
	}),
	clineModel("deepseek/deepseek-chat", "DeepSeek Chat (Cline)", {
		input: ["text"],
		cost: { input: 0.27, output: 1.1, cacheRead: 0.07, cacheWrite: 0 },
		contextWindow: 64000,
		maxTokens: 8192,
	}),
	clineModel("minimax/minimax-m2.5", "MiniMax M2.5 (Cline)", {
		input: ["text", "image"],
		cost: { input: 0.6, output: 3, cacheRead: 0.2, cacheWrite: 0 },
		contextWindow: 200000,
		maxTokens: 65536,
	}),
];

export function clineProvider(): Provider<"openai-completions"> {
	return createProvider({
		id: PROVIDER,
		name: "Cline API",
		auth: { apiKey: clineApiKeyAuth() },
		models: CLINE_MODELS,
		api: {
			"openai-completions": openAICompletionsApi(),
		},
	});
}
