import { describe, expect, it } from "vitest";
import { BUILTIN_SLASH_COMMANDS } from "../src/core/slash-commands.ts";
import { formatGuideCommandOutput, getGuideTopics } from "../src/porcupine/guide.ts";

describe("/guide", () => {
	it("introduces a newcomer to the available learning paths", () => {
		const output = formatGuideCommandOutput("/guide");
		expect(output).toContain("Porcupine Guide");
		expect(output).toContain("/guide start");
		expect(output).toContain("/guide planning");
		expect(output).toContain("/guide computer");
	});

	it("renders a focused topic with concrete steps and shipped docs", () => {
		const output = formatGuideCommandOutput("/guide planning");
		expect(output).toContain("Plans, Goals, Tasks, and Cron");
		expect(output).toContain("/plan <objective>");
		expect(output).toContain("docs/usage.md");
	});

	it("rejects unknown topics with the available topic list", () => {
		const output = formatGuideCommandOutput("/guide teleport");
		expect(output).toContain("Unknown guide topic: teleport");
		expect(output).toContain("/guide start");
	});

	it("registers the guide command and keeps topic identifiers unique", () => {
		expect(BUILTIN_SLASH_COMMANDS).toContainEqual({
			name: "guide",
			description: "Learn Porcupine workflows and capabilities",
			argumentHint: "[topic]",
		});
		const ids = getGuideTopics().map((topic) => topic.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});
