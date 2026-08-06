import type { ArtifactChange } from "@porcupineai/agent-core";
import { beforeAll, describe, expect, it } from "vitest";
import { ArtifactChangeComponent } from "../src/modes/interactive/components/artifact-change.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";
import { stripAnsi } from "../src/utils/ansi.ts";

const change: ArtifactChange = {
	path: "USER.md",
	operation: "updated",
	linesAdded: 2,
	linesRemoved: 0,
	additions: ["- [preference:response-style] User prefers concise responses."],
	removals: [],
	summary: "Learned 1 user pattern.",
};

describe("ArtifactChangeComponent", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	it("renders the compact file update and what the agent wrote", () => {
		const component = new ArtifactChangeComponent(change);

		const output = stripAnsi(component.render(100).join("\n"));

		expect(output).toContain("USER.md updated");
		expect(output).toContain("+ Added 2 lines");
		expect(output).toContain("- [preference:response-style] User prefers concise responses.");
	});

	it("caps compact previews and reveals the complete change when expanded", () => {
		const component = new ArtifactChangeComponent({
			...change,
			linesAdded: 4,
			additions: ["first", "second", "third", "fourth"],
		});

		const compact = stripAnsi(component.render(100).join("\n"));
		expect(compact).toContain("first");
		expect(compact).toContain("third");
		expect(compact).not.toContain("fourth");
		expect(compact).toContain("1 more changed line");

		component.setExpanded(true);
		const expanded = stripAnsi(component.render(100).join("\n"));
		expect(expanded).toContain("fourth");
		expect(expanded).not.toContain("more changed");
	});

	it("renders removed content in an update", () => {
		const component = new ArtifactChangeComponent({
			...change,
			linesAdded: 1,
			linesRemoved: 1,
			additions: ["new preference"],
			removals: ["old preference"],
		});

		const output = stripAnsi(component.render(100).join("\n"));
		expect(output).toContain("- Removed 1 line");
		expect(output).toContain("- old preference");
		expect(output).toContain("+ new preference");
	});
});
