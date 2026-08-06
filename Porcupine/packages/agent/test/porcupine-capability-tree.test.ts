import { describe, expect, it } from "vitest";
import { CapabilityTree } from "../src/porcupine/capability-tree.ts";
import type { CapabilityDescriptor } from "../src/porcupine/types.ts";

const capabilities: CapabilityDescriptor[] = [
	{
		id: "github-code-review",
		kind: "skill",
		path: ["development", "github", "review"],
		description: "Review pull request diffs for correctness and regressions.",
		tags: ["github", "pull-request", "review"],
		available: true,
	},
	{
		id: "terminal",
		kind: "tool",
		path: ["execution", "shell"],
		description: "Run shell commands in a controlled working directory.",
		tags: ["command", "process", "build", "test"],
		available: true,
	},
	{
		id: "browser",
		kind: "tool",
		path: ["web", "interactive"],
		description: "Interact with dynamic browser pages.",
		tags: ["browser", "web"],
		available: false,
	},
];

describe("CapabilityTree", () => {
	it("ranks exact identifiers ahead of tag and description matches", () => {
		const tree = new CapabilityTree(capabilities);

		const matches = tree.search("github-code-review review pull request");

		expect(matches.map((match) => match.capability.id)).toEqual(["github-code-review"]);
		expect(matches[0]?.reasons).toContain("exact-id");
	});

	it("uses path and tags to find the correct capability kind", () => {
		const tree = new CapabilityTree(capabilities);

		const matches = tree.search("execution build command", { kinds: ["tool"] });

		expect(matches[0]?.capability.id).toBe("terminal");
		expect(matches[0]?.reasons).toEqual(expect.arrayContaining(["path:execution", "tag:build", "tag:command"]));
	});

	it("filters unavailable capabilities unless explicitly requested", () => {
		const tree = new CapabilityTree(capabilities);

		expect(tree.search("browser web")).toEqual([]);
		expect(tree.search("browser web", { includeUnavailable: true })[0]?.capability.id).toBe("browser");
	});

	it("returns stable ordering when scores tie", () => {
		const tree = new CapabilityTree([
			{
				id: "write-file",
				kind: "tool",
				path: ["file"],
				description: "Write files.",
				tags: ["file"],
				available: true,
			},
			{
				id: "read-file",
				kind: "tool",
				path: ["file"],
				description: "Read files.",
				tags: ["file"],
				available: true,
			},
		]);

		expect(tree.search("file").map((match) => match.capability.id)).toEqual(["read-file", "write-file"]);
	});

	it("projects the registry into a nested tree for model context and TUI rendering", () => {
		const tree = new CapabilityTree(capabilities);

		expect(tree.project()).toEqual({
			children: {
				development: {
					children: {
						github: {
							children: {
								review: { capabilities: ["github-code-review"] },
							},
						},
					},
				},
				execution: {
					children: {
						shell: { capabilities: ["terminal"] },
					},
				},
				web: {
					children: {
						interactive: { capabilities: ["browser"] },
					},
				},
			},
		});
	});
});
