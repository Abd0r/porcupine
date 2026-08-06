import type { ArtifactChange } from "./artifact-change.ts";
import type { CapabilityTree } from "./capability-tree.ts";
import type {
	CapabilityLearningLoop,
	CapabilityLearningResult,
	LearningObservation,
	UserPatternLearningLoop,
	UserPatternLearningResult,
} from "./learning-loop.ts";
import type { CapabilityMatch } from "./types.ts";

export type RuntimeStatus = "completed" | "blocked" | "failed-execution" | "failed-verification";
export type PrepareStatus = "planned" | "blocked";

export interface TaskIntent {
	objective: string;
	capabilityQueries: string[];
	requiresPlanning: boolean;
}

export interface PlanStep {
	id: string;
	objective: string;
	dependencies: string[];
	capabilityIds: string[];
	expectedArtifacts: string[];
	verification: string;
}

export interface ExecutionPlan {
	steps: PlanStep[];
}

export interface CapabilityRoute {
	matches: CapabilityMatch[];
	matchesByQuery: Record<string, CapabilityMatch[]>;
	missingQueries: string[];
}

export interface StepExecutionResult {
	stepId: string;
	success: boolean;
	artifacts: string[];
	evidence: string[];
	error?: string;
}

export interface VerificationResult {
	success: boolean;
	evidence: string[];
	failures: string[];
}

export interface RuntimeAdapters {
	analyze(prompt: string, signal?: AbortSignal): Promise<TaskIntent>;
	plan(intent: TaskIntent, route: CapabilityRoute, signal?: AbortSignal): Promise<ExecutionPlan>;
	execute(
		step: PlanStep,
		context: { intent: TaskIntent; route: CapabilityRoute; previousResults: StepExecutionResult[] },
		signal?: AbortSignal,
	): Promise<StepExecutionResult>;
	verify(
		intent: TaskIntent,
		plan: ExecutionPlan,
		results: StepExecutionResult[],
		signal?: AbortSignal,
	): Promise<VerificationResult>;
}

export type RuntimeEvent =
	| { type: "phase:analyze" }
	| { type: "phase:route" }
	| { type: "route:complete"; route: CapabilityRoute }
	| { type: "phase:plan" }
	| { type: "plan:complete"; plan: ExecutionPlan }
	| { type: "phase:execute" }
	| { type: "step:start"; step: PlanStep }
	| { type: "step:end"; step: PlanStep; result: StepExecutionResult }
	| { type: "phase:verify" }
	| { type: "verification:complete"; verification: VerificationResult }
	| { type: "phase:learn" }
	| { type: "artifact:changed"; change: ArtifactChange }
	| { type: "phase:complete" };

export interface RuntimeResult {
	status: RuntimeStatus;
	intent: TaskIntent;
	route: CapabilityRoute;
	plan?: ExecutionPlan;
	results: StepExecutionResult[];
	verification: VerificationResult;
	missingCapabilityQueries: string[];
	learning?: CapabilityLearningResult;
	userLearning?: UserPatternLearningResult;
}

/** Analyze → route → plan only. Used by interactive Porcupine before the agent turn. */
export interface RuntimePrepareResult {
	status: PrepareStatus;
	intent: TaskIntent;
	route: CapabilityRoute;
	plan?: ExecutionPlan;
	missingCapabilityQueries: string[];
	learning?: CapabilityLearningResult;
	userLearning?: UserPatternLearningResult;
}

export interface PorcupineAgentRuntimeOptions {
	capabilities: CapabilityTree;
	adapters: RuntimeAdapters;
	capabilityLearner?: Pick<CapabilityLearningLoop, "learn">;
	userPatternLearner?: Pick<UserPatternLearningLoop, "learn">;
	onEvent?: (event: RuntimeEvent) => Promise<void> | void;
}

const EMPTY_VERIFICATION: VerificationResult = {
	success: false,
	evidence: [],
	failures: [],
};

export class PorcupineAgentRuntime {
	private readonly capabilities: CapabilityTree;
	private readonly adapters: RuntimeAdapters;
	private readonly capabilityLearner?: Pick<CapabilityLearningLoop, "learn">;
	private readonly userPatternLearner?: Pick<UserPatternLearningLoop, "learn">;
	private readonly onEvent?: (event: RuntimeEvent) => Promise<void> | void;

	constructor(options: PorcupineAgentRuntimeOptions) {
		this.capabilities = options.capabilities;
		this.adapters = options.adapters;
		this.capabilityLearner = options.capabilityLearner;
		this.userPatternLearner = options.userPatternLearner;
		this.onEvent = options.onEvent;
	}

	async run(prompt: string, signal?: AbortSignal): Promise<RuntimeResult> {
		const prepared = await this.prepare(prompt, signal);
		if (prepared.status === "blocked" || !prepared.plan) {
			return {
				status: "blocked",
				intent: prepared.intent,
				route: prepared.route,
				results: [],
				verification: {
					...EMPTY_VERIFICATION,
					failures: prepared.missingCapabilityQueries.map((query) => `No capability matched: ${query}`),
				},
				missingCapabilityQueries: prepared.missingCapabilityQueries,
				learning: prepared.learning,
				userLearning: prepared.userLearning,
			};
		}

		const { intent, route, plan, userLearning } = prepared;

		await this.emit({ type: "phase:execute" });
		const results: StepExecutionResult[] = [];
		for (const step of this.orderSteps(plan)) {
			await this.emit({ type: "step:start", step });
			const result = await this.adapters.execute(step, { intent, route, previousResults: results.slice() }, signal);
			results.push(result);
			await this.emit({ type: "step:end", step, result });
			if (!result.success) {
				const learning = await this.learnCapability({
					type: "execution-failure",
					capabilityId: step.capabilityIds[0],
					description: result.error ?? `Step failed: ${step.id}`,
					evidence: result.evidence.length > 0 ? result.evidence : [result.error ?? `failed step: ${step.id}`],
				});
				return {
					status: "failed-execution",
					intent,
					route,
					plan,
					results,
					verification: {
						...EMPTY_VERIFICATION,
						failures: [result.error ?? `Step failed: ${step.id}`],
					},
					missingCapabilityQueries: [],
					learning,
					userLearning,
				};
			}
		}

		await this.emit({ type: "phase:verify" });
		const verification = await this.adapters.verify(intent, plan, results, signal);
		await this.emit({ type: "verification:complete", verification });
		if (!verification.success) {
			const learning = await this.learnCapability({
				type: "verification-failure",
				description: verification.failures.join(" ") || "Verification failed without a reason.",
				evidence: verification.failures.length > 0 ? verification.failures : verification.evidence,
			});
			return {
				status: "failed-verification",
				intent,
				route,
				plan,
				results,
				verification,
				missingCapabilityQueries: [],
				learning,
				userLearning,
			};
		}

		await this.emit({ type: "phase:complete" });
		return {
			status: "completed",
			intent,
			route,
			plan,
			results,
			verification,
			missingCapabilityQueries: [],
			userLearning,
		};
	}

	/**
	 * Interactive entry: analyze → route → plan.
	 * Does not execute tools; the coding-agent turn owns execution.
	 */
	async prepare(prompt: string, signal?: AbortSignal): Promise<RuntimePrepareResult> {
		await this.emit({ type: "phase:analyze" });
		const intent = await this.adapters.analyze(prompt, signal);
		const userLearning = await this.userPatternLearner?.learn(prompt);
		if (userLearning?.fileChange) {
			await this.emit({ type: "artifact:changed", change: userLearning.fileChange });
		}

		await this.emit({ type: "phase:route" });
		const route = this.route(intent);
		await this.emit({ type: "route:complete", route });
		if (route.missingQueries.length > 0) {
			const learning = await this.learnCapability({
				type: "missing-capability",
				description: `No registered capability matched: ${route.missingQueries.join(", ")}`,
				evidence: route.missingQueries.map((query) => `unmatched query: ${query}`),
			});
			return {
				status: "blocked",
				intent,
				route,
				missingCapabilityQueries: route.missingQueries,
				learning,
				userLearning,
			};
		}

		await this.emit({ type: "phase:plan" });
		const plan = await this.adapters.plan(intent, route, signal);
		this.validatePlan(plan, route);
		await this.emit({ type: "plan:complete", plan });

		return {
			status: "planned",
			intent,
			route,
			plan,
			missingCapabilityQueries: [],
			userLearning,
		};
	}

	private route(intent: TaskIntent): CapabilityRoute {
		const matchesByQuery: Record<string, CapabilityMatch[]> = {};
		const deduplicated = new Map<string, CapabilityMatch>();
		const missingQueries: string[] = [];

		for (const query of intent.capabilityQueries) {
			const matches = this.capabilities.search(query, { limit: 3 });
			matchesByQuery[query] = matches;
			if (matches.length === 0) missingQueries.push(query);
			for (const match of matches) {
				const existing = deduplicated.get(match.capability.id);
				if (!existing || match.score > existing.score) deduplicated.set(match.capability.id, match);
			}
		}

		return {
			matches: [...deduplicated.values()].sort(
				(left, right) => right.score - left.score || left.capability.id.localeCompare(right.capability.id),
			),
			matchesByQuery,
			missingQueries,
		};
	}

	private validatePlan(plan: ExecutionPlan, route: CapabilityRoute): void {
		const stepIds = new Set<string>();
		const routedIds = new Set(route.matches.map((match) => match.capability.id));
		for (const step of plan.steps) {
			if (stepIds.has(step.id)) throw new Error(`Duplicate plan step: ${step.id}`);
			stepIds.add(step.id);
			for (const capabilityId of step.capabilityIds) {
				if (!routedIds.has(capabilityId)) {
					throw new Error(`Plan step ${step.id} uses an unrouted capability: ${capabilityId}`);
				}
			}
		}
		for (const step of plan.steps) {
			for (const dependency of step.dependencies) {
				if (!stepIds.has(dependency)) throw new Error(`Unknown dependency ${dependency} in step ${step.id}`);
			}
		}
	}

	private orderSteps(plan: ExecutionPlan): PlanStep[] {
		const ordered: PlanStep[] = [];
		const remaining = new Map(plan.steps.map((step) => [step.id, step]));
		const completed = new Set<string>();
		while (remaining.size > 0) {
			const ready = [...remaining.values()]
				.filter((step) => step.dependencies.every((dependency) => completed.has(dependency)))
				.sort((left, right) => left.id.localeCompare(right.id));
			if (ready.length === 0) throw new Error("Plan contains a dependency cycle");
			for (const step of ready) {
				ordered.push(step);
				completed.add(step.id);
				remaining.delete(step.id);
			}
		}
		return ordered;
	}

	private async emit(event: RuntimeEvent): Promise<void> {
		await this.onEvent?.(event);
	}

	private async learnCapability(observation: LearningObservation): Promise<CapabilityLearningResult | undefined> {
		if (!this.capabilityLearner) return undefined;
		await this.emit({ type: "phase:learn" });
		try {
			return await this.capabilityLearner.learn(observation);
		} catch (error) {
			// A learning failure (e.g. the adapter refusing to overwrite an existing
			// skill) must never abort the turn; record it as a rejected proposal.
			return {
				status: "rejected",
				reasons: [`Learning skipped: ${error instanceof Error ? error.message : String(error)}`],
			};
		}
	}
}
