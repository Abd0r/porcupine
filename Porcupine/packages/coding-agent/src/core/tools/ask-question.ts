import { Text } from "@porcupineai/tui";
import { type Static, Type } from "typebox";
import { theme } from "../../modes/interactive/theme/theme.ts";
import type { ToolDefinition } from "../extensions/types.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

const optionSchema = Type.Object({
	label: Type.String({ description: "The option label shown to the user", minLength: 1, maxLength: 200 }),
	description: Type.Optional(Type.String({ description: "A short explanation of this option", maxLength: 300 })),
});

const askQuestionSchema = Type.Object({
	question: Type.String({ description: "The question to ask the user", minLength: 1, maxLength: 2000 }),
	options: Type.Optional(
		Type.Array(optionSchema, {
			description: "Options the user can choose from. Omit or use an empty array for free-text input.",
			maxItems: 20,
		}),
	),
	allow_custom: Type.Optional(
		Type.Boolean({ description: "When options are provided, also allow the user to enter a custom answer" }),
	),
});

export type AskQuestionToolInput = Static<typeof askQuestionSchema>;
export interface AskQuestionToolDetails {
	question: string;
	answer: string | null;
	cancelled: boolean;
	custom: boolean;
	/** True when the user did not answer within the dialog timeout. */
	timedOut?: boolean;
}

/** Cap dialog display and model-context payloads at sane sizes. */
const MAX_ANSWER_CHARS = 2000;

/** Default time a question waits for an answer before the model may move on. */
const DEFAULT_TIMEOUT_MS = 3 * 60 * 1000;

/** Cancel result guidance: prevents the agent from re-asking the same question in a loop. */
const CANCELLED_TEXT =
	"User cancelled the question. Do not re-ask the same question — proceed with the best judgment or state what is still required.";

/** Timeout result guidance: the user is away, not refusing — re-ask or keep working. */
const TIMED_OUT_TEXT =
	"User did not answer within 3 minutes. You may re-ask the question later, continue working with your best judgment, or stop and state what is still required.";

/** Distinguishes a dialog timeout from a user cancel (both resolve undefined). */
const TIMEOUT_SENTINEL = Symbol("ask-question-timeout");

async function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | typeof TIMEOUT_SENTINEL> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<typeof TIMEOUT_SENTINEL>((resolve) => {
				timer = setTimeout(() => resolve(TIMEOUT_SENTINEL), timeoutMs);
			}),
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

/** Strip control characters from dialog titles/labels so the selector stays one-line clean. */
function sanitizeForDialog(value: string): string {
	return value.replace(/[\r\n\t]+/g, " ").trim();
}

/**
 * Reverse-map a selected dialog string back to its option label.
 * Exact clean-label matches win (avoids "label — description" pollution and
 * crafted collisions), then the rendered string, then the raw selection.
 */
function resolveSelectedOption(
	options: Array<{ label: string; description?: string }>,
	labels: string[],
	selected: string,
): string {
	const clean = options.find((option) => option.label === selected);
	if (clean) return clean.label;
	const index = labels.indexOf(selected);
	return index >= 0 ? options[index]!.label : selected;
}

function result(details: AskQuestionToolDetails, text: string) {
	return { content: [{ type: "text" as const, text }], details };
}

export function createAskQuestionToolDefinition(
	options: { timeoutMs?: number } = {},
): ToolDefinition<typeof askQuestionSchema, AskQuestionToolDetails> {
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	return {
		name: "ask_question",
		label: "Ask Question",
		description:
			"Ask the user for a decision or missing information. Use this instead of guessing when the answer affects the work.",
		promptSnippet: "Ask the user a structured question",
		promptGuidelines: [
			"Ask only when user input is needed to choose between viable paths or provide missing requirements.",
			"Prefer concise questions with 2–5 useful options; allow a custom answer when appropriate.",
		],
		parameters: askQuestionSchema,
		executionMode: "sequential",
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const question = sanitizeForDialog(params.question);
			const details = {
				question,
				answer: null,
				cancelled: false,
				custom: false,
			} satisfies AskQuestionToolDetails;
			if (!ctx.hasUI || !ctx.ui) {
				return result(details, "Unable to ask the user: interactive UI is unavailable in this mode.");
			}
			if (signal?.aborted) {
				return result({ ...details, cancelled: true }, "Question cancelled.");
			}

			const options = (params.options ?? []).map((option) => ({
				label: sanitizeForDialog(option.label),
				description: option.description ? sanitizeForDialog(option.description) : undefined,
			}));
			if (options.length === 0) {
				const answer = await runWithTimeout(ctx.ui.input(question, undefined, { signal }), timeoutMs);
				if (answer === TIMEOUT_SENTINEL) {
					return result({ ...details, timedOut: true }, TIMED_OUT_TEXT);
				}
				if (!answer?.trim()) return result({ ...details, cancelled: true }, CANCELLED_TEXT);
				const trimmed = answer.trim().slice(0, MAX_ANSWER_CHARS);
				return result({ ...details, answer: trimmed, custom: true }, `User answered: ${trimmed}`);
			}

			const labels = options.map((option) =>
				option.description ? `${option.label} — ${option.description}` : option.label,
			);
			const customLabel = "Other (type a custom answer)";
			const selected = await runWithTimeout(
				ctx.ui.select(question, params.allow_custom === false ? labels : [...labels, customLabel], {
					signal,
				}),
				timeoutMs,
			);
			if (selected === TIMEOUT_SENTINEL) {
				return result({ ...details, timedOut: true }, TIMED_OUT_TEXT);
			}
			if (!selected) return result({ ...details, cancelled: true }, CANCELLED_TEXT);
			if (params.allow_custom !== false && selected === customLabel) {
				const answer = await runWithTimeout(ctx.ui.input(question, undefined, { signal }), timeoutMs);
				if (answer === TIMEOUT_SENTINEL) {
					return result({ ...details, timedOut: true }, TIMED_OUT_TEXT);
				}
				if (!answer?.trim()) return result({ ...details, cancelled: true }, CANCELLED_TEXT);
				const trimmed = answer.trim().slice(0, MAX_ANSWER_CHARS);
				return result({ ...details, answer: trimmed, custom: true }, `User answered: ${trimmed}`);
			}

			const answer = resolveSelectedOption(options, labels, selected);
			return result({ ...details, answer }, `User selected: ${answer}`);
		},
		renderCall(args) {
			return new Text(`${theme.fg("toolTitle", theme.bold("ask_question"))} ${args.question}`, 0, 0);
		},
		renderResult(toolResult, _options, resultTheme) {
			const details = toolResult.details;
			if (details?.cancelled) return new Text(resultTheme.fg("warning", "Cancelled"), 0, 0);
			if (details?.timedOut) return new Text(resultTheme.fg("warning", "⏱ Timed out (no answer)"), 0, 0);
			return new Text(`${resultTheme.fg("success", "✓ ")}${details?.answer ?? "No answer"}`, 0, 0);
		},
	};
}

export function createAskQuestionTool() {
	return wrapToolDefinition(createAskQuestionToolDefinition());
}
