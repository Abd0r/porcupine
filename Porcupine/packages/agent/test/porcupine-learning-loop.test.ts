import { describe, expect, it } from "vitest";
import {
	type CapabilityLearningAdapters,
	CapabilityLearningLoop,
	type UserPatternLearningAdapters,
	UserPatternLearningLoop,
} from "../src/porcupine/learning-loop.ts";

describe("CapabilityLearningLoop", () => {
	it("creates and activates a validated capability for a missing route", async () => {
		const calls: string[] = [];
		const adapters: CapabilityLearningAdapters = {
			async draft(context) {
				calls.push(`draft:${context.recommendedAction}`);
				return {
					id: "deploy-quantum",
					kind: "skill",
					action: context.recommendedAction,
					summary: "Add a deployment procedure.",
					content: "# Deploy Quantum\n\nValidated procedure.",
					evidence: context.observation.evidence,
				};
			},
			async validate(proposal) {
				calls.push(`validate:${proposal.id}`);
				return { valid: true, checks: ["schema", "isolated-test"], errors: [] };
			},
			async activate(proposal) {
				calls.push(`activate:${proposal.id}`);
			},
		};
		const loop = new CapabilityLearningLoop(adapters);

		const result = await loop.learn({
			type: "missing-capability",
			description: "No deployment capability matched.",
			evidence: ["query: quantum deployment fabric"],
		});

		expect(result.status).toBe("activated");
		expect(result.proposal?.action).toBe("create");
		expect(calls).toEqual(["draft:create", "validate:deploy-quantum", "activate:deploy-quantum"]);
	});

	it("patches an implicated capability but never activates an invalid proposal", async () => {
		let activated = false;
		const adapters: CapabilityLearningAdapters = {
			async draft(context) {
				return {
					id: context.observation.capabilityId ?? "unknown",
					kind: "tool",
					action: context.recommendedAction,
					summary: "Correct command argument handling.",
					content: "patch",
					evidence: context.observation.evidence,
				};
			},
			async validate() {
				return { valid: false, checks: ["schema"], errors: ["Regression test failed."] };
			},
			async activate() {
				activated = true;
			},
		};
		const loop = new CapabilityLearningLoop(adapters);

		const result = await loop.learn({
			type: "execution-failure",
			capabilityId: "terminal",
			description: "The tool used an invalid command form.",
			evidence: ["exit code 2"],
		});

		expect(result.status).toBe("rejected");
		expect(result.proposal?.action).toBe("patch");
		expect(activated).toBe(false);
	});

	it("rejects observations without evidence before drafting", async () => {
		let drafted = false;
		const loop = new CapabilityLearningLoop({
			async draft() {
				drafted = true;
				throw new Error("must not draft");
			},
			async validate() {
				throw new Error("must not validate");
			},
			async activate() {
				throw new Error("must not activate");
			},
		});

		const result = await loop.learn({
			type: "verification-failure",
			description: "The result was not verified.",
			evidence: [],
		});

		expect(result.status).toBe("rejected");
		expect(drafted).toBe(false);
	});
});

describe("UserPatternLearningLoop", () => {
	it("saves an explicit stable preference to USER.md", async () => {
		let userFile = "# User\n";
		const writes: Array<{ path: string; content: string }> = [];
		const adapters: UserPatternLearningAdapters = {
			async extract() {
				return [
					{
						key: "response-style",
						category: "preference",
						fact: "User prefers concise responses.",
						confidence: 1,
						evidence: ["User explicitly requested concise responses."],
						sensitive: false,
						temporary: false,
					},
				];
			},
			async readUserFile() {
				return userFile;
			},
			async writeUserFile(path, content) {
				userFile = content;
				writes.push({ path, content });
			},
		};
		const loop = new UserPatternLearningLoop(adapters);

		const result = await loop.learn("Keep your answers concise.");

		expect(result.status).toBe("updated");
		expect(writes[0]?.path).toBe("USER.md");
		expect(userFile).toContain("- [preference:response-style] User prefers concise responses.");
	});

	it("replaces a contradicted pattern instead of appending both", async () => {
		let userFile = "# User\n\n- [preference:response-style] User prefers detailed responses.\n";
		const adapters: UserPatternLearningAdapters = {
			async extract() {
				return [
					{
						key: "response-style",
						category: "preference",
						fact: "User prefers concise responses.",
						confidence: 1,
						evidence: ["Explicit correction."],
						sensitive: false,
						temporary: false,
					},
				];
			},
			async readUserFile() {
				return userFile;
			},
			async writeUserFile(_path, content) {
				userFile = content;
			},
		};
		const loop = new UserPatternLearningLoop(adapters);

		await loop.learn("No, be concise.");

		expect(userFile).not.toContain("detailed responses");
		expect(userFile.match(/response-style/g)).toHaveLength(1);
	});

	it("does not persist sensitive, temporary, weak, or unsupported inferences", async () => {
		let writes = 0;
		const adapters: UserPatternLearningAdapters = {
			async extract() {
				return [
					{
						key: "secret",
						category: "context",
						fact: "User secret is redacted.",
						confidence: 1,
						evidence: ["Observed a credential."],
						sensitive: true,
						temporary: false,
					},
					{
						key: "current-task",
						category: "workflow",
						fact: "User is currently editing one file.",
						confidence: 1,
						evidence: ["Current turn."],
						sensitive: false,
						temporary: true,
					},
				];
			},
			async readUserFile() {
				return "# User\n";
			},
			async writeUserFile() {
				writes++;
			},
		};
		const loop = new UserPatternLearningLoop(adapters);

		const result = await loop.learn("temporary sensitive input");

		expect(result.status).toBe("unchanged");
		expect(writes).toBe(0);
	});
});
