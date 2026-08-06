/**
 * Adaptive Reasoning — Hermes-style per-turn thinking depth.
 *
 * When adaptive mode is on, a tiny classification call picks a concrete
 * thinking level for THIS user message only (minimal…max). Failures fall
 * back to "medium" so classification never breaks the real response.
 *
 * This is NOT a planner/skill/tool classifier. Planning and skill loading
 * stay with the main model as personality — see personality.ts.
 */

import type { ThinkingLevel } from "@porcupineai/agent-core";
import type { Model } from "@porcupineai/ai";
import type { ModelRuntime } from "../core/model-runtime.ts";
import { classifyWithSessionModel } from "./llm-classify.ts";

/** Concrete levels adaptive may resolve to (never "off" / "adaptive"). */
export const ADAPTIVE_CONCRETE_LEVELS = [
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
] as const satisfies readonly ThinkingLevel[];

export type AdaptiveConcreteLevel = (typeof ADAPTIVE_CONCRETE_LEVELS)[number];

export const ADAPTIVE_FALLBACK: AdaptiveConcreteLevel = "medium";

const CLASSIFY_PROMPT = `You will be shown a single user message. Decide how much reasoning effort a response to it deserves, choosing exactly one of: minimal, low, medium, high, xhigh, max.
- minimal: greetings, small talk, trivial lookups, pure acknowledgements
- low: simple factual questions, short direct requests, one-liners
- medium: multi-step but routine tasks
- high: non-trivial coding, debugging, multi-step reasoning, OR any request emphasizing correctness/rigor ("properly", "make sure", "verify", "double-check", "understand it", "read carefully") even if the message itself is short
- xhigh: hard math/proofs, complex architecture/design, deep multi-step analysis with clear bounded scope
- max: open-ended research/synthesis, large multi-file refactors, production-critical debugging with many unknowns, or explicit asks for maximum depth
Prefer the lowest level that still matches the intent. Escalate only when lower tiers would clearly under-serve the ask.
Reply with EXACTLY ONE WORD from that list and nothing else — no punctuation, no explanation.`;

export function parseAdaptiveEffort(text: string): AdaptiveConcreteLevel {
	const cleaned = (text || "").trim().toLowerCase().replace(/["'`]/g, "");
	if ((ADAPTIVE_CONCRETE_LEVELS as readonly string[]).includes(cleaned)) {
		return cleaned as AdaptiveConcreteLevel;
	}
	for (const token of cleaned.split(/\s+/)) {
		const t = token.replace(/[.,!:;]+$/g, "");
		if ((ADAPTIVE_CONCRETE_LEVELS as readonly string[]).includes(t)) {
			return t as AdaptiveConcreteLevel;
		}
	}
	// light synonyms
	if (/\bultra\b/.test(cleaned) || /\bmaximum\b/.test(cleaned)) return "max";
	if (/\bnone\b|\boff\b/.test(cleaned)) return "minimal";
	return ADAPTIVE_FALLBACK;
}

/**
 * Cheap heuristic used when no model is available or as a pre-filter.
 * Not a substitute for the LLM classifier when one is available.
 */
export function heuristicAdaptiveEffort(userMessage: string): AdaptiveConcreteLevel {
	const text = (userMessage || "").trim();
	if (!text) return ADAPTIVE_FALLBACK;
	const lower = text.toLowerCase();
	const len = text.length;

	if (/^(hi|hey|hello|thanks|thx|ty|ok|okay|yo|sup|good\s*(morning|night|evening)|bye)\b[!?.\s]*$/i.test(text)) {
		return "minimal";
	}
	if (len < 40 && !/\b(fix|debug|implement|design|architect|prove|verify|refactor)\b/i.test(lower)) {
		return "low";
	}
	if (/\b(ultra|think hard|as hard as possible|maximum depth|be thorough)\b/i.test(lower)) {
		return "max";
	}
	if (/\b(prove|formal|architecture|multi-file|production|security)\b/i.test(lower) || len > 1200) {
		return "xhigh";
	}
	if (
		/\b(debug|fix|implement|refactor|verify|carefully|properly|double-?check|race condition)\b/i.test(lower) ||
		len > 280
	) {
		return "high";
	}
	return "medium";
}

export async function classifyAdaptiveReasoning(options: {
	userMessage: string;
	modelRuntime: ModelRuntime;
	model: Model<any> | undefined;
	/** When true, skip LLM and use heuristic only (tests / offline). */
	heuristicOnly?: boolean;
}): Promise<AdaptiveConcreteLevel> {
	const snippet = (options.userMessage || "").slice(0, 2000);
	if (!snippet.trim()) return ADAPTIVE_FALLBACK;

	if (options.heuristicOnly || !options.model) {
		return heuristicAdaptiveEffort(snippet);
	}

	const raw = await classifyWithSessionModel({
		modelRuntime: options.modelRuntime,
		model: options.model,
		system: CLASSIFY_PROMPT,
		user: snippet,
		maxTokens: 16,
	});

	if (!raw.trim()) {
		return heuristicAdaptiveEffort(snippet);
	}
	return parseAdaptiveEffort(raw);
}

/** Clamp adaptive result to levels the active model actually supports. */
export function clampAdaptiveToAvailable(
	level: AdaptiveConcreteLevel,
	available: readonly ThinkingLevel[],
): ThinkingLevel {
	if (available.includes(level)) return level;
	// Prefer nearest lower concrete effort, then nearest higher. Never land on
	// "off" unless it is the only available level.
	const order: ThinkingLevel[] = ["minimal", "low", "medium", "high", "xhigh", "max"];
	const start = order.indexOf(level);
	if (start === -1) {
		return available.includes("medium") ? "medium" : (available.find((l) => l !== "off") ?? available[0] ?? "off");
	}
	for (let i = start - 1; i >= 0; i--) {
		if (available.includes(order[i]!)) return order[i]!;
	}
	for (let i = start + 1; i < order.length; i++) {
		if (available.includes(order[i]!)) return order[i]!;
	}
	return available.includes("medium") ? "medium" : (available.find((l) => l !== "off") ?? available[0] ?? "off");
}
