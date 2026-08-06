import { describe, expect, it } from "vitest";
import type { ExecutionPlan, RuntimeAdapters, RuntimeEvent, TaskIntent } from "../src/porcupine/agent-runtime.ts";
import { PorcupineAgentRuntime } from "../src/porcupine/agent-runtime.ts";
import { CapabilityTree } from "../src/porcupine/capability-tree.ts";

function createTree(): CapabilityTree {
	return new CapabilityTree([
		{
			id: "read-file",
			kind: "tool",
			path: ["file", "read"],
			description: "Read source files from a workspace.",
			tags: ["read", "file", "source"],
			available: true,
		},
		{
			id: "systematic-debugging",
			kind: "skill",
			path: ["development", "debugging"],
			description: "Debug failures by reproducing and tracing their root cause.",
			tags: ["debug", "failure", "root-cause"],
			available: true,
		},
	]);
}

function createIntent(): TaskIntent {
	return {
		objective: "Debug the failing source file",
		capabilityQueries: ["debug failure root cause", "read source file"],
		requiresPlanning: true,
	};
}

function createPlan(): ExecutionPlan {
	return {
		steps: [
			{
				id: "inspect",
				objective: "Read the failing source file",
				dependencies: [],
				capabilityIds: ["read-file"],
				expectedArtifacts: ["source-content"],
				verification: "Source content was returned.",
			},
			{
				id: "diagnose",
				objective: "Identify the root cause",
				dependencies: ["inspect"],
				capabilityIds: ["systematic-debugging"],
				expectedArtifacts: ["diagnosis"],
				verification: "Diagnosis cites the failing mechanism.",
			},
		],
	};
}

describe("PorcupineAgentRuntime", () => {
	it("routes capabilities before planning, then executes and verifies in order", async () => {
		const calls: string[] = [];
		const events: string[] = [];
		const adapters: RuntimeAdapters = {
			async analyze() {
				calls.push("analyze");
				return createIntent();
			},
			async plan(_intent, route) {
				calls.push(
					`plan:${route.matches
						.map((match) => match.capability.id)
						.sort()
						.join(",")}`,
				);
				return createPlan();
			},
			async execute(step) {
				calls.push(`execute:${step.id}`);
				return {
					stepId: step.id,
					success: true,
					artifacts: step.expectedArtifacts,
					evidence: [`completed:${step.id}`],
				};
			},
			async verify(_intent, _plan, results) {
				calls.push(`verify:${results.map((result) => result.stepId).join(",")}`);
				return { success: true, evidence: ["all contracts passed"], failures: [] };
			},
		};
		const runtime = new PorcupineAgentRuntime({
			capabilities: createTree(),
			adapters,
			onEvent: (event: RuntimeEvent) => {
				events.push(event.type);
			},
		});

		const result = await runtime.run("Fix the failing source file");

		expect(calls).toEqual([
			"analyze",
			"plan:read-file,systematic-debugging",
			"execute:inspect",
			"execute:diagnose",
			"verify:inspect,diagnose",
		]);
		expect(events).toEqual([
			"phase:analyze",
			"phase:route",
			"route:complete",
			"phase:plan",
			"plan:complete",
			"phase:execute",
			"step:start",
			"step:end",
			"step:start",
			"step:end",
			"phase:verify",
			"verification:complete",
			"phase:complete",
		]);
		expect(result.status).toBe("completed");
		expect(result.verification.success).toBe(true);
	});

	it("blocks before planning when a required capability query has no match", async () => {
		let planned = false;
		const adapters: RuntimeAdapters = {
			async analyze() {
				return {
					objective: "Deploy to an unknown platform",
					capabilityQueries: ["quantum deployment fabric"],
					requiresPlanning: true,
				};
			},
			async plan() {
				planned = true;
				return { steps: [] };
			},
			async execute() {
				throw new Error("must not execute");
			},
			async verify() {
				throw new Error("must not verify");
			},
		};
		const runtime = new PorcupineAgentRuntime({ capabilities: createTree(), adapters });

		const result = await runtime.run("Deploy this");

		expect(planned).toBe(false);
		expect(result.status).toBe("blocked");
		expect(result.missingCapabilityQueries).toEqual(["quantum deployment fabric"]);
	});

	it("does not complete when verification fails", async () => {
		const adapters: RuntimeAdapters = {
			async analyze() {
				return createIntent();
			},
			async plan() {
				return createPlan();
			},
			async execute(step) {
				return { stepId: step.id, success: true, artifacts: [], evidence: [] };
			},
			async verify() {
				return { success: false, evidence: [], failures: ["No test output was captured."] };
			},
		};
		const runtime = new PorcupineAgentRuntime({ capabilities: createTree(), adapters });

		const result = await runtime.run("Fix the failing source file");

		expect(result.status).toBe("failed-verification");
		expect(result.verification.failures).toEqual(["No test output was captured."]);
	});

	it("supports prepare without execute", async () => {
		const events: string[] = [];
		const adapters: RuntimeAdapters = {
			async analyze() {
				return createIntent();
			},
			async plan() {
				return createPlan();
			},
			async execute(step) {
				return { stepId: step.id, success: true, artifacts: [], evidence: [] };
			},
			async verify() {
				return { success: true, evidence: ["ok"], failures: [] };
			},
		};
		const runtime = new PorcupineAgentRuntime({
			capabilities: createTree(),
			adapters,
			onEvent: (event) => {
				events.push(event.type);
			},
		});

		const prepared = await runtime.prepare("Fix the failing source file");
		expect(prepared.status).toBe("planned");
		expect(prepared.plan?.steps.length).toBeGreaterThan(0);
		expect(events).toEqual(["phase:analyze", "phase:route", "route:complete", "phase:plan", "plan:complete"]);
	});

	it("records a rejected learning result instead of crashing when learning throws", async () => {
		// A throwing learner (e.g. the adapter refusing to overwrite an existing
		// skill) must never abort the turn: learnCapability catches it.
		const adapters: RuntimeAdapters = {
			async analyze() {
				return createIntent();
			},
			async plan() {
				return createPlan();
			},
			async execute(step) {
				// Fail the first step so the runtime reaches the learning phase.
				return { stepId: step.id, success: false, artifacts: [], evidence: ["boom"], error: "boom" };
			},
			async verify() {
				return { success: true, evidence: ["ok"], failures: [] };
			},
		};
		const runtime = new PorcupineAgentRuntime({
			capabilities: createTree(),
			adapters,
			capabilityLearner: {
				async learn() {
					throw new Error("Refusing to overwrite existing skill: /tmp/learned-x/SKILL.md");
				},
			},
		});

		const result = await runtime.run("Fix the failing source file");
		expect(result.status).toBe("failed-execution");
		expect(result.learning?.status).toBe("rejected");
		expect(result.learning?.reasons.join(" ")).toContain("Refusing to overwrite");
	});
});
