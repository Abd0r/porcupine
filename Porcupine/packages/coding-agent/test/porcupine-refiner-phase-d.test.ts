import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { recordSkillUse } from "../src/porcupine/evidence-counter.ts";
import { listLearningFeed, readSnapshot } from "../src/porcupine/learning-store.ts";
import { deletePromptNote, listPromptNotes, readPromptNote, upsertPromptNote } from "../src/porcupine/prompt-notes.ts";
import { listRefinableSkills, runRefiner } from "../src/porcupine/refiner.ts";

function tempDir(prefix: string): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

function writeCraftedSkill(dir: string, stack: string, name: string, body: string): string {
	const path = join(dir, "skills", stack, name, "SKILL.md");
	mkdirSync(join(dir, "skills", stack, name), { recursive: true });
	writeFileSync(
		path,
		`---\nname: ${name}\ndescription: test skill\nstack: ${stack}\ncreated_by: porcupine-learning\n---\n\n${body}\n`,
		"utf8",
	);
	return path;
}

describe("prompt notes (Phase D)", () => {
	it("creates, reads, lists and deletes notes", () => {
		const dir = tempDir("porcupine-notes-");
		expect(
			upsertPromptNote(dir, { title: "Fast File Edits", body: "Prefer edit over write for small diffs." }).ok,
		).toBe(true);
		const note = readPromptNote(dir, "fast-file-edits");
		expect(note?.title).toBe("Fast File Edits");
		expect(note?.body).toContain("Prefer edit");
		expect(listPromptNotes(dir).length).toBe(1);
		expect(deletePromptNote(dir, "fast-file-edits").ok).toBe(true);
		expect(readPromptNote(dir, "fast-file-edits")).toBeUndefined();
	});

	it("rejects invalid slugs and empty bodies", () => {
		const dir = tempDir("porcupine-notes-bad-");
		expect(upsertPromptNote(dir, { title: "a", body: "x" }).ok).toBe(false); // slug too short
		expect(upsertPromptNote(dir, { title: "Valid Title", body: "   " }).ok).toBe(false); // empty body
	});
});

describe("refiner (Phase D)", () => {
	it("lists only porcupine-crafted skills as refinable", () => {
		const dir = tempDir("porcupine-refiner-list-");
		writeCraftedSkill(dir, "debug", "learned-repro", "## Procedure\n1. Reproduce.\n");
		// A user-authored skill must NOT be refinable.
		const userPath = join(dir, "skills", "vcs", "my-user-skill", "SKILL.md");
		mkdirSync(join(dir, "skills", "vcs", "my-user-skill"), { recursive: true });
		writeFileSync(userPath, "---\nname: my-user-skill\ndescription: mine\n---\n\nuser stuff\n", "utf8");
		const refinable = listRefinableSkills(dir);
		expect(refinable.map((s) => s.name)).toEqual(["learned-repro"]);
	});

	it("auto-refines a weak porcupine-crafted skill with snapshot + proposal + feed", async () => {
		const dir = tempDir("porcupine-refiner-run-");
		const skillName = "learned-http-timeouts";
		const path = writeCraftedSkill(dir, "web", skillName, "## Procedure\n1. Set a timeout.\n");
		// Weak skill: success rate well below the 0.6 candidate threshold.
		for (let i = 0; i < 6; i++) recordSkillUse(dir, skillName, false);

		const results = await runRefiner({ agentDir: dir, maxSkillsPerRun: 2 });
		expect(results.length).toBe(1);
		const result = results[0]!;
		expect(result.via).toBe("heuristic"); // no LLM generator in the test
		expect(result.proposal.origin).toBe("porcupine-crafted");
		expect(result.proposal.riskTier).toBe("medium");
		expect(result.proposal.snapshotRef).toBeTruthy();
		expect(result.linesAdded).toBeGreaterThan(0);

		// Snapshot exists (rollback capability) and feed entry announced.
		expect(readSnapshot(dir, result.proposal.snapshotRef!)).toBeTruthy();
		const feed = listLearningFeed(dir, 5);
		expect(feed.some((e) => e.action === "edited" && e.proposalId === result.proposal.id)).toBe(true);

		// Frontmatter untouched (spec-valid), body gained the Evidence Update.
		const content = readFileSync(path, "utf8");
		expect(content).toContain("created_by: porcupine-learning");
		expect(content).toContain("## Evidence Update (auto-refined)");
	});

	it("never refines a user-authored skill", async () => {
		const dir = tempDir("porcupine-refiner-user-");
		const userPath = join(dir, "skills", "meta", "user-skill", "SKILL.md");
		mkdirSync(join(dir, "skills", "meta", "user-skill"), { recursive: true });
		writeFileSync(userPath, "---\nname: user-skill\ndescription: mine\n---\n\noriginal\n", "utf8");
		recordSkillUse(dir, "user-skill", false);
		const results = await runRefiner({ agentDir: dir });
		expect(results.length).toBe(0);
		expect(readFileSync(userPath, "utf8")).toContain("original");
	});
});
