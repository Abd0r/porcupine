import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { UserPatternLearningLoop } from "../src/porcupine/learning-loop.ts";
import { createNodeUserPatternLearningAdapters } from "../src/porcupine/node-user-pattern-store.ts";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "porcupine-user-patterns-"));
	temporaryDirectories.push(directory);
	return directory;
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

describe("node USER.md pattern store", () => {
	it("creates USER.md atomically when the first stable pattern is learned", async () => {
		const rootDir = await createTemporaryDirectory();
		const adapters = createNodeUserPatternLearningAdapters({
			rootDir,
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
		});
		const learner = new UserPatternLearningLoop(adapters);

		const result = await learner.learn("Keep replies concise.");

		expect(result.status).toBe("updated");
		expect(await readFile(join(rootDir, "USER.md"), "utf8")).toBe(
			"# User\n\n- [preference:response-style] User prefers concise responses.\n",
		);
	});

	it("preserves existing USER.md content while updating one governed pattern", async () => {
		const rootDir = await createTemporaryDirectory();
		await writeFile(
			join(rootDir, "USER.md"),
			"# User\n\nFree-form note that Porcupine does not own.\n\n- [preference:response-style] User prefers details.\n",
		);
		const adapters = createNodeUserPatternLearningAdapters({
			rootDir,
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
		});
		const learner = new UserPatternLearningLoop(adapters);

		await learner.learn("No, be concise.");

		const content = await readFile(join(rootDir, "USER.md"), "utf8");
		expect(content).toContain("Free-form note that Porcupine does not own.");
		expect(content).toContain("User prefers concise responses.");
		expect(content).not.toContain("User prefers details.");
	});

	it("refuses paths that escape the configured root", async () => {
		const rootDir = await createTemporaryDirectory();
		const adapters = createNodeUserPatternLearningAdapters({ rootDir, extract: async () => [] });

		await expect(adapters.writeUserFile("../USER.md", "forbidden")).rejects.toThrow("outside the configured root");
	});
});
