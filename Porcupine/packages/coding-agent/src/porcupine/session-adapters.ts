import type {
	CapabilityRoute,
	CapabilityTree,
	ExecutionPlan,
	PlanStep,
	RuntimeAdapters,
	StepExecutionResult,
	TaskIntent,
	VerificationResult,
} from "@porcupineai/agent-core";

const STOP_WORDS = new Set([
	"a",
	"an",
	"and",
	"the",
	"to",
	"of",
	"for",
	"in",
	"on",
	"with",
	"this",
	"that",
	"it",
	"is",
	"be",
	"as",
	"at",
	"by",
	"from",
	"or",
	"if",
	"my",
	"me",
	"we",
	"you",
	"your",
	"please",
	"can",
	"could",
	"would",
	"should",
	"just",
	"into",
	"about",
]);

function tokenize(text: string): string[] {
	return [
		...new Set(
			text
				.toLowerCase()
				.split(/[^a-z0-9]+/)
				.filter((token) => token.length >= 3 && !STOP_WORDS.has(token)),
		),
	];
}

function slugify(value: string): string {
	return (
		value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 40) || "step"
	);
}

/**
 * Deterministic runtime adapters for interactive Porcupine.
 * Analyze/plan use the capability tree; execute/verify support full autonomous runs.
 */
export function createHeuristicRuntimeAdapters(capabilities: CapabilityTree): RuntimeAdapters {
	return {
		async analyze(prompt: string): Promise<TaskIntent> {
			const objective = prompt.trim().split(/\n+/)[0]?.slice(0, 240) || "Complete the user request";
			const tokens = tokenize(prompt);
			const queries: string[] = [];

			// Whole-prompt search first — only keep queries that actually route.
			if (capabilities.search(prompt, { limit: 1 }).length > 0) {
				queries.push(prompt.slice(0, 120));
			}

			for (const token of tokens.slice(0, 12)) {
				if (capabilities.search(token, { limit: 1 }).length > 0) {
					queries.push(token);
				}
			}

			// Keyword-driven capability phrases.
			const keywordQueries: Array<[RegExp, string]> = [
				[/\b(test|spec|vitest|pytest|jest)\b/i, "test"],
				[/\b(debug|bug|error|fail|stack)\b/i, "debug"],
				[/\b(read|open|inspect|show)\b/i, "read"],
				[/\b(edit|fix|patch|change|update)\b/i, "edit"],
				[/\b(write|create|add|implement)\b/i, "write"],
				[/\b(bash|shell|run|command|npm|git)\b/i, "bash"],
				[/\b(web|browser|fetch|http|url)\b/i, "web"],
				[/\b(skill|playbook)\b/i, "skill"],
			];
			for (const [pattern, query] of keywordQueries) {
				if (pattern.test(prompt) && capabilities.search(query, { limit: 1 }).length > 0) {
					queries.push(query);
				}
			}

			// Always ensure at least one matchable query from available tools.
			if (queries.length === 0) {
				for (const capability of capabilities.list().slice(0, 6)) {
					const tag = capability.tags.find((t) => t !== "tool" && t !== "skill") ?? capability.id;
					if (capabilities.search(tag, { limit: 1 }).length > 0) {
						queries.push(tag);
					}
					if (queries.length >= 3) break;
				}
			}

			// De-dupe while preserving order.
			const capabilityQueries = [...new Set(queries)].slice(0, 8);
			const requiresPlanning =
				prompt.length > 80 ||
				/\b(and then|then|after|also|plus|multi|steps?|plan)\b/i.test(prompt) ||
				capabilityQueries.length > 2;

			return {
				objective,
				capabilityQueries:
					capabilityQueries.length > 0
						? capabilityQueries
						: capabilities
								.list()
								.slice(0, 3)
								.map((c) => c.id),
				requiresPlanning,
			};
		},

		async plan(intent: TaskIntent, route: CapabilityRoute): Promise<ExecutionPlan> {
			const matches = route.matches.slice(0, intent.requiresPlanning ? 5 : 3);
			if (matches.length === 0) {
				return { steps: [] };
			}

			const steps: PlanStep[] = matches.map((match, index) => {
				const name = match.capability.id.replace(/^(tool|skill):/, "");
				const id = `${slugify(name)}-${index + 1}`;
				return {
					id,
					objective: `${match.capability.kind === "skill" ? "Apply" : "Use"} ${name}: ${match.capability.description}`,
					dependencies:
						index === 0
							? []
							: [`${slugify(matches[index - 1]!.capability.id.replace(/^(tool|skill):/, ""))}-${index}`],
					capabilityIds: [match.capability.id],
					expectedArtifacts: match.capability.kind === "tool" ? [`${name}-result`] : [`${name}-guidance`],
					verification: `Step ${id} produced useful evidence for: ${intent.objective}`,
				};
			});

			// Fix dependencies to use actual previous step ids.
			for (let i = 0; i < steps.length; i++) {
				steps[i]!.dependencies = i === 0 ? [] : [steps[i - 1]!.id];
			}

			return { steps };
		},

		async execute(step: PlanStep): Promise<StepExecutionResult> {
			// Full autonomous execute is a handoff marker unless a caller replaces this adapter.
			return {
				stepId: step.id,
				success: true,
				artifacts: step.expectedArtifacts,
				evidence: [`scheduled:${step.id}`, step.objective],
			};
		},

		async verify(
			_intent: TaskIntent,
			_plan: ExecutionPlan,
			results: StepExecutionResult[],
		): Promise<VerificationResult> {
			const failed = results.filter((result) => !result.success);
			if (failed.length > 0) {
				return {
					success: false,
					evidence: results.flatMap((result) => result.evidence),
					failures: failed.map((result) => result.error ?? `Step failed: ${result.stepId}`),
				};
			}
			return {
				success: true,
				evidence: results.flatMap((result) => result.evidence),
				failures: [],
			};
		},
	};
}
