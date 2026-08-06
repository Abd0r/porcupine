import { describe, expect, it } from "vitest";
import { PorcupineAgentRuntime } from "../src/porcupine/agent-runtime.ts";
import { formatArtifactChange } from "../src/porcupine/artifact-change.ts";
import { CapabilityTree } from "../src/porcupine/capability-tree.ts";
import { UserPatternLearningLoop } from "../src/porcupine/learning-loop.ts";

function createUserLearner(initialContent = "# User\n") {
	let content = initialContent;
	const learner = new UserPatternLearningLoop({
		async extract() {
			return [
				{
					key: "response-style",
					category: "preference",
					fact: "User prefers concise responses.",
					confidence: 1,
					evidence: ["Explicit request."],
					sensitive: false,
					temporary: false,
				},
			];
		},
		async readUserFile() {
			return content;
		},
		async writeUserFile(_path, nextContent) {
			content = nextContent;
		},
	});
	return { learner, read: () => content };
}

describe("artifact change events", () => {
	it("describes the USER.md update and the exact fact that was added", async () => {
		const { learner } = createUserLearner();

		const result = await learner.learn("Keep replies concise.");

		expect(result.fileChange).toEqual({
			path: "USER.md",
			operation: "updated",
			linesAdded: 2,
			linesRemoved: 0,
			additions: ["- [preference:response-style] User prefers concise responses."],
			removals: [],
			summary: "Learned 1 user pattern.",
		});
		expect(formatArtifactChange(result.fileChange!)).toBe(
			"USER.md updated\n+ Added 2 lines\n  - [preference:response-style] User prefers concise responses.",
		);
	});

	it("reports replacement lines when a learned pattern contradicts USER.md", async () => {
		const { learner } = createUserLearner(
			"# User\n\n- [preference:response-style] User prefers detailed responses.\n",
		);

		const result = await learner.learn("No, keep replies concise.");

		expect(result.fileChange).toMatchObject({
			path: "USER.md",
			operation: "updated",
			linesAdded: 1,
			linesRemoved: 1,
			additions: ["- [preference:response-style] User prefers concise responses."],
			removals: ["- [preference:response-style] User prefers detailed responses."],
		});
	});

	it("emits a TUI-ready artifact event from the runtime", async () => {
		const { learner } = createUserLearner();
		const events: string[] = [];
		const runtime = new PorcupineAgentRuntime({
			capabilities: new CapabilityTree([
				{
					id: "read-file",
					kind: "tool",
					path: ["file"],
					description: "Read a file.",
					tags: ["read", "file"],
					available: true,
				},
			]),
			userPatternLearner: learner,
			adapters: {
				async analyze() {
					return { objective: "Read file", capabilityQueries: ["read file"], requiresPlanning: false };
				},
				async plan() {
					return { steps: [] };
				},
				async execute() {
					throw new Error("No steps expected.");
				},
				async verify() {
					return { success: true, evidence: ["Nothing to execute."], failures: [] };
				},
			},
			onEvent(event) {
				if (event.type === "artifact:changed") events.push(formatArtifactChange(event.change));
			},
		});

		const result = await runtime.run("Remember that I prefer concise responses.");

		expect(result.userLearning?.status).toBe("updated");
		expect(events).toEqual([
			"USER.md updated\n+ Added 2 lines\n  - [preference:response-style] User prefers concise responses.",
		]);
	});
});
