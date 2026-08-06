import { describe, expect, it } from "vitest";
import type { RuntimeAdapters } from "../src/porcupine/agent-runtime.ts";
import { PorcupineAgentRuntime } from "../src/porcupine/agent-runtime.ts";
import { CapabilityTree } from "../src/porcupine/capability-tree.ts";

function createCapabilities(): CapabilityTree {
	return new CapabilityTree([
		{
			id: "read-file",
			kind: "tool",
			path: ["file", "read"],
			description: "Read source files from a workspace.",
			tags: ["read", "file", "source"],
			available: true,
		},
	]);
}

describe("Porcupine learning integration", () => {
	it("learns user patterns from the prompt and capability gaps from failed verification", async () => {
		const observations: string[] = [];
		const learnedMessages: string[] = [];
		const adapters: RuntimeAdapters = {
			async analyze() {
				return {
					objective: "Read the source",
					capabilityQueries: ["read source file"],
					requiresPlanning: true,
				};
			},
			async plan() {
				return {
					steps: [
						{
							id: "inspect",
							objective: "Read the source",
							dependencies: [],
							capabilityIds: ["read-file"],
							expectedArtifacts: ["content"],
							verification: "Content was returned.",
						},
					],
				};
			},
			async execute() {
				return { stepId: "inspect", success: true, artifacts: [], evidence: [] };
			},
			async verify() {
				return { success: false, evidence: [], failures: ["No file content was returned."] };
			},
		};
		const runtime = new PorcupineAgentRuntime({
			capabilities: createCapabilities(),
			adapters,
			capabilityLearner: {
				async learn(observation) {
					observations.push(`${observation.type}:${observation.evidence.join(",")}`);
					return { status: "rejected", reasons: ["test proposal only"] };
				},
			},
			userPatternLearner: {
				async learn(message) {
					learnedMessages.push(message);
					return { status: "unchanged", accepted: [], rejected: [] };
				},
			},
		});

		const result = await runtime.run("Read this, and remember that I prefer concise replies.");

		expect(learnedMessages).toEqual(["Read this, and remember that I prefer concise replies."]);
		expect(observations).toEqual(["verification-failure:No file content was returned."]);
		expect(result.learning?.status).toBe("rejected");
	});

	it("sends missing capability evidence to learning before returning blocked", async () => {
		const observations: string[] = [];
		const adapters: RuntimeAdapters = {
			async analyze() {
				return {
					objective: "Deploy to an unknown platform",
					capabilityQueries: ["quantum deployment fabric"],
					requiresPlanning: true,
				};
			},
			async plan() {
				throw new Error("must not plan");
			},
			async execute() {
				throw new Error("must not execute");
			},
			async verify() {
				throw new Error("must not verify");
			},
		};
		const runtime = new PorcupineAgentRuntime({
			capabilities: createCapabilities(),
			adapters,
			capabilityLearner: {
				async learn(observation) {
					observations.push(`${observation.type}:${observation.description}`);
					return { status: "rejected", reasons: ["test proposal only"] };
				},
			},
		});

		const result = await runtime.run("Deploy this");

		expect(observations).toEqual(["missing-capability:No registered capability matched: quantum deployment fabric"]);
		expect(result.learning?.status).toBe("rejected");
	});
});
