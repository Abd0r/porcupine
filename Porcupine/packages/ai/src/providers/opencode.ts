import { anthropicMessagesApi } from "../api/anthropic-messages.lazy.ts";
import { googleGenerativeAIApi } from "../api/google-generative-ai.lazy.ts";
import { openAICompletionsApi } from "../api/openai-completions.lazy.ts";
import { openAIResponsesApi } from "../api/openai-responses.lazy.ts";
import type { ApiKeyAuth } from "../auth/types.ts";
import { createProvider, type Provider } from "../models.ts";
import { OPENCODE_MODELS } from "./opencode.models.ts";

const OPENCODE_AUTH_URL = "https://opencode.ai/auth";
const OPENCODE_ENV = ["OPENCODE_API_KEY"] as const;

/** OpenCode Zen: subscription / account API key from opencode.ai/auth (paste into /login). */
function opencodeZenApiKeyAuth(): ApiKeyAuth {
	return {
		name: "OpenCode Zen API key",
		login: async (interaction) => {
			interaction.notify({
				type: "info",
				message: `OpenCode Zen: sign in at ${OPENCODE_AUTH_URL}, then paste your API key.`,
			});
			const key = await interaction.prompt({
				type: "secret",
				message: "Enter OpenCode Zen API key",
			});
			return { type: "api_key", key };
		},
		resolve: async ({ ctx, credential }) => {
			if (credential?.key) {
				return { auth: { apiKey: credential.key }, env: credential.env, source: "stored credential" };
			}
			for (const envVar of OPENCODE_ENV) {
				const value = await ctx.env(envVar);
				if (value) return { auth: { apiKey: value }, source: envVar };
			}
			return undefined;
		},
	};
}

export function opencodeProvider(): Provider<
	"anthropic-messages" | "google-generative-ai" | "openai-completions" | "openai-responses"
> {
	return createProvider({
		id: "opencode",
		name: "OpenCode Zen",
		auth: { apiKey: opencodeZenApiKeyAuth() },
		models: Object.values(OPENCODE_MODELS),
		api: {
			"anthropic-messages": anthropicMessagesApi(),
			"google-generative-ai": googleGenerativeAIApi(),
			"openai-completions": openAICompletionsApi(),
			"openai-responses": openAIResponsesApi(),
		},
	});
}
