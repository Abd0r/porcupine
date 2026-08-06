import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BUILTIN_SLASH_COMMANDS } from "../src/core/slash-commands.ts";
import { discoverProjects, formatProjectsCommandOutput, searchProjects } from "../src/porcupine/project-search.ts";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function createWorkspace(): string {
	const root = mkdtempSync(join(tmpdir(), "porcupine-project-search-"));
	roots.push(root);
	return root;
}

function createProject(root: string, name: string, readme: string, status?: string): void {
	const directory = join(root, "Project", name);
	mkdirSync(directory, { recursive: true });
	writeFileSync(join(directory, "README.md"), readme);
	if (status !== undefined) writeFileSync(join(directory, "STATUS.md"), status);
}

describe("Porcupine project search", () => {
	it("indexes canonical project workspaces with title, state, and status", () => {
		const root = createWorkspace();
		createProject(
			root,
			"cell-atlas",
			"# Cell Atlas\n\n## Objective\nBuild a leakage-safe cancer data index.\n",
			"# Status: Cell Atlas\n\n## State\n`active`\n\n## Current position\nValidated the assay manifest.\n",
		);

		expect(discoverProjects(root)).toEqual([
			expect.objectContaining({
				name: "cell-atlas",
				title: "Cell Atlas",
				state: "active",
				statusSummary: "Validated the assay manifest.",
			}),
		]);
	});

	it("searches project names, README content, and current status using all query terms", () => {
		const root = createWorkspace();
		createProject(
			root,
			"cell-atlas",
			"# Cell Atlas\n\n## Objective\nBuild a leakage-safe cancer data index.\n",
			"# Status\n\n## State\n`active`\n\n## Current position\nValidated the assay manifest.\n",
		);
		createProject(
			root,
			"terminal-theme",
			"# Terminal Theme\n\nRefresh Porcupine colors.\n",
			"# Status\n\n## State\n`paused`\n",
		);

		expect(searchProjects(root, "leakage cancer").map((project) => project.name)).toEqual(["cell-atlas"]);
		expect(searchProjects(root, "validated manifest").map((project) => project.name)).toEqual(["cell-atlas"]);
		expect(searchProjects(root, "terminal active")).toEqual([]);
	});

	it("formats helpful list, search, and hygiene guidance without dumping project documents", () => {
		const root = createWorkspace();
		createProject(root, "incomplete", "# Incomplete\n\nA project without a status file.\n");

		const list = formatProjectsCommandOutput(root);
		expect(list).toContain("Projects (1)");
		expect(list).toContain("Project/incomplete");
		expect(list).toContain("hygiene: missing STATUS.md");
		expect(formatProjectsCommandOutput(root, "unknown project")).toContain("No project matches");
		expect(formatProjectsCommandOutput(createWorkspace())).toContain("No project workspaces found");
	});

	it("registers /projects in built-in slash completion", () => {
		expect(BUILTIN_SLASH_COMMANDS.some((command) => command.name === "projects")).toBe(true);
	});
});
