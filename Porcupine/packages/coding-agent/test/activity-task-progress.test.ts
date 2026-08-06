import { beforeAll, describe, expect, it } from "vitest";
import { formatTaskProgress } from "../src/modes/interactive/components/footer.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";
import {
	animationLoaderOptions,
	normalizeAnimationId,
	resolveToolActivity,
	skillNameFromPath,
} from "../src/porcupine/animations.ts";
import type { TaskGraphStepStatus, TaskGraphView } from "../src/porcupine/session-orchestrator.ts";
import { stripAnsi } from "../src/utils/ansi.ts";

function graph(steps: TaskGraphView["steps"]): TaskGraphView {
	return { objective: "o", status: "running", steps, routeSummary: [] };
}

beforeAll(() => {
	initTheme("dark");
});

describe("resolveToolActivity", () => {
	it("maps capability_search to searching for skills/tools", () => {
		expect(resolveToolActivity("capability_search", { action: "search", kind: "skill" })).toEqual({
			id: "searching-skills",
		});
		expect(resolveToolActivity("capability_search", { action: "search", kind: "tool" })).toEqual({
			id: "searching-tools",
		});
		expect(resolveToolActivity("capability_search", { action: "list" })).toEqual({ id: "searching" });
	});

	it("maps capability_search view to a named skill read", () => {
		expect(resolveToolActivity("capability_search", { action: "view", query: "project-hygiene" })).toEqual({
			id: "reading-skill",
			name: "project-hygiene",
		});
	});

	it("maps projects to searching/reading with names", () => {
		expect(resolveToolActivity("projects", { action: "list" })).toEqual({ id: "searching-projects" });
		expect(resolveToolActivity("projects", { action: "view", query: "cell-atlas" })).toEqual({
			id: "reading-project",
			name: "cell-atlas",
		});
	});

	it("maps reading a SKILL.md via the read tool to a named skill read", () => {
		expect(resolveToolActivity("read", { path: "/x/skills/vcs/git-basics/SKILL.md" })).toEqual({
			id: "reading-skill",
			name: "git-basics",
		});
		expect(resolveToolActivity("read", { path: "/x/src/main.ts" })).toBeUndefined();
	});

	it("falls back for unknown tools", () => {
		expect(resolveToolActivity("bash", { command: "ls" })).toBeUndefined();
	});
});

describe("skillNameFromPath", () => {
	it("extracts the skill directory name", () => {
		expect(skillNameFromPath("/skills/vcs/git-basics/SKILL.md")).toBe("git-basics");
		expect(skillNameFromPath("C:\\skills\\meta\\memory-hygiene\\SKILL.md")).toBe("memory-hygiene");
	});
});

describe("named animation labels", () => {
	it("appends the name to the chip label", () => {
		const options = animationLoaderOptions("reading-skill", "git-basics");
		expect(options.frames[0]).toContain("📖  Reading skill: git-basics");
	});

	it("normalizes the new ids", () => {
		expect(normalizeAnimationId("reading-skill")).toBe("reading-skill");
		expect(normalizeAnimationId("searching-projects")).toBe("searching-projects");
	});
});

describe("formatTaskProgress", () => {
	it("returns nothing when there is no plan or zero steps", () => {
		expect(formatTaskProgress(undefined)).toBeUndefined();
		expect(formatTaskProgress(graph([]))).toBeUndefined();
	});

	it("renders per-step chips for a small plan", () => {
		const steps: TaskGraphView["steps"] = [
			{ id: "1", objective: "a", capabilityIds: [], status: "done" },
			{ id: "2", objective: "b", capabilityIds: [], status: "active" },
			{ id: "3", objective: "c", capabilityIds: [], status: "pending" },
			{ id: "4", objective: "d", capabilityIds: [], status: "pending" },
		];
		expect(stripAnsi(formatTaskProgress(graph(steps))!)).toBe("1✓ 2▶ 3 4");
	});

	it("shows failures and skips", () => {
		const steps: TaskGraphView["steps"] = [
			{ id: "1", objective: "a", capabilityIds: [], status: "done" },
			{ id: "2", objective: "b", capabilityIds: [], status: "failed" },
			{ id: "3", objective: "c", capabilityIds: [], status: "skipped" },
		];
		expect(stripAnsi(formatTaskProgress(graph(steps))!)).toBe("1✓ 2✗ 3");
	});

	it("switches to a done/total counter for large plans", () => {
		const steps: TaskGraphView["steps"] = Array.from({ length: 10 }, (_, i) => ({
			id: `s${i}`,
			objective: `step ${i}`,
			capabilityIds: [],
			status: (i < 3 ? "done" : i === 3 ? "active" : "pending") as TaskGraphStepStatus,
		}));
		expect(stripAnsi(formatTaskProgress(graph(steps))!)).toBe("3/10 ✓ (step 4)");
	});
});
