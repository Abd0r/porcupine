import { anthropicMessagesApi } from "../api/anthropic-messages.lazy.ts";
import { openAICompletionsApi } from "../api/openai-completions.lazy.ts";
import { openAIResponsesApi } from "../api/openai-responses.lazy.ts";
import type { ApiKeyAuth } from "../auth/types.ts";
import { createProvider, type Provider } from "../models.ts";
import { OPENCODE_GO_MODELS } from "./opencode-go.models.ts";

const OPENCODE_AUTH_URL = "https://opencode.ai/auth";
const OPENCODE_ENV = ["OPENCODE_API_KEY"] as const;

/**
 * OpenCode Go uses a subscription API key (not browser OAuth device flow).
 * Users sign in at opencode.ai/auth, copy the key, and paste it in /login.
 */
function opencodeGoApiKeyAuth(): ApiKeyAuth {
	return {
		name: "OpenCode Go API key",
		login: async (interaction) => {
			interaction.notify({
				type: "info",
				message: `OpenCode Go: create/subscribe at ${OPENCODE_AUTH_URL}, then paste your API key.`,
			});
			const key = await interaction.prompt({
				type: "secret",
				message: "Enter OpenCode Go API key",
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

export function opencodeGoProvider(): Provider<"anthropic-messages" | "openai-completions" | "openai-responses"> {
	return createProvider<"anthropic-messages" | "openai-completions" | "openai-responses">({
		id: "opencode-go",
		name: "OpenCode Go",
		auth: { apiKey: opencodeGoApiKeyAuth() },
		models: Object.values(OPENCODE_GO_MODELS),
		api: {
			"anthropic-messages": anthropicMessagesApi(),
			"openai-completions": openAICompletionsApi(),
			"openai-responses": openAIResponsesApi(),
		},
	});
}
