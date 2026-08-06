import type { Model } from "@porcupineai/ai";
import { Agent } from "../agent.ts";
import { estimateTokens } from "../harness/compaction/compaction.ts";
import type { AgentMessage, AgentTool, AgentToolResult, StreamFn, ThinkingLevel } from "../types.ts";

/**
 * Porcupine sub-agent system.
 *
 * A sub-agent is an isolated context island: a fresh Agent instance with its
 * own conversation, a curated tool set, and hard budgets (steps + context
 * tokens). The parent agent spawns it via the `subagent` tool and receives a
 * structured result back — no context pollution, no daemon. Multiple
 * sub-agents may run concurrently up to `subagent.maxConcurrent`.
 */

export const DEFAULT_SUBAGENT_MAX_STEPS = 30;
export const DEFAULT_SUBAGENT_CONTEXT_TOKENS = 256_000;
/** Lower bound for the recommended 128K–256K sub-agent context window. */
export const SUBAGENT_CONTEXT_WINDOW_MIN = 128_000;
export const SUBAGENT_CONTEXT_WINDOW_MAX = 256_000;

export interface SubagentOptions {
	/** The task the sub-agent must complete. */
	task: string;
	/** Optional additional context (notes, constraints) injected before the task. */
	notes?: string;
	/** Model to run the sub-agent on (cheap/small model recommended, user-configurable). */
	model: Model<any>;
	/** Stream function wiring (reused from the parent session). */
	streamFn: StreamFn;
	getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
	/** Curated tool set for the sub-agent. */
	tools: AgentTool<any>[];
	/** System prompt describing the sub-agent's role and constraints. */
	systemPrompt: string;
	/** Maximum tool-call steps before the sub-agent stops gracefully. */
	maxSteps?: number;
	/** Maximum estimated context tokens before the sub-agent stops gracefully. */
	maxContextTokens?: number;
	thinkingLevel?: ThinkingLevel;
	/** Unique id forwarded to providers (cache-aware backends). */
	sessionId?: string;
	/** Progress callback wired to the TUI sub-agent panel. */
	onProgress?: (event: SubagentProgressEvent) => void;
	/**
	 * WoT: called with a steer function once the sub-agent's Agent is created.
	 * The parent can inject messages into the sub-agent's LIVE context instantly
	 * (steering messages are polled by the running loop before each response).
	 */
	registerSteer?: (steer: (text: string) => void) => void;
	/** Abort signal: cancels the sub-agent run. */
	signal?: AbortSignal;
}

export interface SubagentUsage {
	inputTokens: number;
	outputTokens: number;
	contextTokens: number;
}

export interface SubagentResult {
	ok: boolean;
	/** Final assistant text message (may be empty if budget stopped the run). */
	summary: string;
	/** Number of tool-call steps executed. */
	steps: number;
	usage: SubagentUsage;
	/** Full transcript of the sub-agent's isolated conversation. */
	messages: AgentMessage[];
	/** True when the run stopped because a budget (steps or context) was hit. */
	budgetExhausted: boolean;
	/** True when the run was cancelled via the abort signal. */
	cancelled?: boolean;
	error?: string;
}

export type SubagentProgressEvent =
	| { type: "start"; subagentId?: string; task: string; maxSteps: number; maxContextTokens: number }
	| { type: "step"; subagentId?: string; step: number; toolName: string }
	| { type: "turn"; subagentId?: string; step: number; contextTokens: number }
	| { type: "done"; subagentId?: string; result: SubagentResult };

/**
 * Wrap a tool with a step counter. The counter is enforced at the tool-call
 * boundary so a runaway sub-agent can never exceed its budget.
 */
function withStepCounter(tool: AgentTool<any>, onStep: (toolName: string) => void): AgentTool<any> {
	return {
		...tool,
		execute: async (...args: Parameters<AgentTool<any>["execute"]>): Promise<AgentToolResult<any>> => {
			onStep(tool.name);
			return tool.execute(...args);
		},
	};
}

function estimateContextTokens(systemPrompt: string, messages: AgentMessage[]): number {
	let total = Math.ceil(systemPrompt.length / 4);
	for (const message of messages) {
		total += estimateTokens(message);
	}
	return total;
}

function summarize(messages: AgentMessage[]): string {
	// Last assistant message text is the sub-agent's final answer.
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i];
		if (message.role !== "assistant") continue;
		const text = (message.content ?? [])
			.filter((part): part is { type: "text"; text: string } => part.type === "text")
			.map((part) => part.text)
			.join("\n")
			.trim();
		if (text.length > 0) return text;
	}
	return "";
}

function defaultSystemPrompt(taskLabel: string): string {
	return [
		"You are a Porcupine sub-agent: a focused, disposable worker with an isolated context window.",
		`Your task: ${taskLabel}`,
		"",
		"- Complete the task using the provided tools. Work autonomously.",
		"- Keep responses concise. Prefer concrete file paths and verified command output.",
		"- You have a hard step and context budget. Stop as soon as the task is done — do not gold-plate.",
		"- Your final message is the report returned to the parent agent: state what was done, key findings, and exact file paths touched.",
	].join("\n");
}

export async function runSubagent(options: SubagentOptions): Promise<SubagentResult> {
	const maxSteps = options.maxSteps ?? DEFAULT_SUBAGENT_MAX_STEPS;
	const maxContextTokens = options.maxContextTokens ?? DEFAULT_SUBAGENT_CONTEXT_TOKENS;
	const systemPrompt = options.systemPrompt || defaultSystemPrompt(options.task.slice(0, 120));
	let steps = 0;
	let inputTokens = 0;
	let outputTokens = 0;
	let budgetHit = false;
	let stopRun: (() => void) | undefined;

	options.onProgress?.({
		type: "start",
		task: options.task,
		maxSteps,
		maxContextTokens,
	});

	const toolWrappers = options.tools.map((tool) =>
		withStepCounter(tool, (toolName) => {
			steps += 1;
			if (steps > maxSteps) {
				budgetHit = true;
				stopRun?.();
			}
			options.onProgress?.({ type: "step", step: steps, toolName });
		}),
	);

	const agent = new Agent({
		initialState: {
			model: options.model,
			systemPrompt,
			tools: toolWrappers,
			thinkingLevel: options.thinkingLevel ?? "off",
		},
		streamFn: options.streamFn,
		getApiKey: options.getApiKey,
		sessionId: options.sessionId ? `${options.sessionId}/subagent` : undefined,
	});

	// WoT: hand the parent a live steer handle so messages can be injected into
	// this sub-agent's context instantly (the loop polls the steering queue).
	options.registerSteer?.((text: string) => {
		agent.steer({
			role: "user",
			content: [{ type: "text", text }],
			timestamp: Date.now(),
		});
	});

	agent.subscribe((event) => {
		if (event.type === "turn_end") {
			const contextTokens = estimateContextTokens(systemPrompt, agent.state.messages);
			inputTokens = Math.max(inputTokens, contextTokens);
			const content =
				event.message && "content" in event.message && Array.isArray(event.message.content)
					? event.message.content
					: [];
			outputTokens += content
				.filter((part): part is { type: "text"; text: string } => part.type === "text")
				.reduce((total, part) => total + part.text.length, 0);
			if (contextTokens > maxContextTokens) {
				budgetHit = true;
				stopRun?.();
			}
			options.onProgress?.({ type: "turn", step: steps, contextTokens });
		}
	});

	stopRun = () => agent.abort();

	// Consume the abort signal: a cancel (e.g. user Escape, session abort) stops
	// the sub-agent mid-run. If the signal is already aborted, never start it.
	let aborted = options.signal?.aborted ?? false;
	const onAbort = () => {
		aborted = true;
		stopRun?.();
	};
	if (!options.signal?.aborted) {
		options.signal?.addEventListener("abort", onAbort, { once: true });
	}

	let promptError: unknown;
	try {
		if (!aborted) {
			await agent.prompt(options.notes ? `${options.notes}\n\n${options.task}` : options.task);
		}
	} catch (error) {
		promptError = error;
	}
	options.signal?.removeEventListener("abort", onAbort);

	const messages = agent.state.messages;
	const result: SubagentResult = {
		ok: !budgetHit && !aborted,
		summary: summarize(messages),
		steps,
		usage: {
			inputTokens,
			outputTokens: Math.ceil(outputTokens / 4),
			contextTokens: estimateContextTokens(systemPrompt, messages),
		},
		messages,
		budgetExhausted: budgetHit,
		cancelled: aborted,
		error: aborted
			? "sub-agent cancelled"
			: budgetHit
				? `sub-agent budget exhausted (${maxSteps} steps, ${maxContextTokens} ctx)`
				: promptError instanceof Error
					? promptError.message
					: promptError !== undefined
						? String(promptError)
						: undefined,
	};
	options.onProgress?.({ type: "done", result });
	return result;
}

/** Clamp a user-configured sub-agent context window into the supported 128K–256K range. */
export function normalizeContextWindow(value: number | undefined): number {
	if (value === undefined || Number.isNaN(value)) return DEFAULT_SUBAGENT_CONTEXT_TOKENS;
	return Math.min(SUBAGENT_CONTEXT_WINDOW_MAX, Math.max(SUBAGENT_CONTEXT_WINDOW_MIN, Math.round(value)));
}
