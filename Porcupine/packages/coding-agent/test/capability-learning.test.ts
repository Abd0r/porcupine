import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	createAutonomousCapabilityLearningAdapters,
	type LearningObservation,
} from "../src/porcupine/capability-learning.ts";

function observation(overrides: Partial<LearningObservation> = {}): LearningObservation {
	return {
		type: "execution-failure",
		description: "Deploy step failed",
		evidence: ["step failed: deploy"],
		...overrides,
	};
}

describe("autonomous capability learning adapters", () => {
	it("patches an existing learned skill without nesting frontmatter", async () => {
		const agentDir = mkdtempSync(join(tmpdir(), "porcupine-capability-learn-"));
		const adapters = createAutonomousCapabilityLearningAdapters(agentDir);

		// First observation creates the learned skill (no capability id).
		const createProposal = await adapters.draft({ observation: observation(), recommendedAction: "create" });
		await adapters.activate(createProposal);
		const skillPath = join(agentDir, "skills", "meta", createProposal.id, "SKILL.md");
		expect(existsSync(skillPath)).toBe(true);

		// Second observation implicates that capability (patch) — the draft must
		// carry the full existing document, and activate must not re-wrap it
		// inside a new frontmatter block.
		const patchProposal = await adapters.draft({
			observation: observation({ capabilityId: createProposal.id }),
			recommendedAction: "patch",
		});
		expect(patchProposal.content.startsWith("---")).toBe(true);
		await adapters.activate(patchProposal);

		const patched = readFileSync(skillPath, "utf8");
		expect(patched).toContain("## Learning update");
		// Exactly one frontmatter block: no nested `---` inside the body.
		expect(patched.match(/^---$/m)?.length).toBe(1);
		expect(patched.indexOf("name:") === patched.lastIndexOf("name:")).toBe(true);
	});

	it("refuses to overwrite an existing skill on create", async () => {
		const agentDir = mkdtempSync(join(tmpdir(), "porcupine-capability-learn-"));
		const adapters = createAutonomousCapabilityLearningAdapters(agentDir);
		const proposal = await adapters.draft({ observation: observation(), recommendedAction: "create" });

		// Simulate an already-existing learned/user skill at the target path.
		const dir = join(agentDir, "skills", "meta", proposal.id);
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "SKILL.md"), "---\nname: existing\n---\nuser-edited content\n");

		await expect(adapters.activate(proposal)).rejects.toThrow(/Refusing to overwrite/);
		expect(readFileSync(join(dir, "SKILL.md"), "utf8")).toContain("user-edited content");
	});
});
