import { describe, expect, it } from "vitest";
import {
	ANIMATIONS,
	animationLoaderOptions,
	easterEggsFor,
	formatAnimationMessage,
	getAnimation,
	isEasterEggAnimation,
	normalizeAnimationId,
	pickStatusAnimation,
	resolveAnimationFromText,
	resolveAnimationFromToolName,
} from "../src/porcupine/animations.ts";

describe("porcupine/animations", () => {
	it("registers core animations plus easter eggs", () => {
		const ids = ANIMATIONS.map((a) => a.id);
		for (const core of [
			"working",
			"thinking",
			"reading",
			"writing",
			"editing",
			"updating",
			"searching",
			"running",
			"browsing",
			"compacting",
			"error",
		]) {
			expect(ids).toContain(core);
		}
		// At least 10 easter eggs
		const eggs = ANIMATIONS.filter((a) => a.easterEggOf);
		expect(eggs.length).toBeGreaterThanOrEqual(10);
		expect(easterEggsFor("working").length).toBeGreaterThanOrEqual(5);
		expect(easterEggsFor("thinking").length).toBeGreaterThanOrEqual(4);
	});

	it("every animation has a fixed emoji + label", () => {
		for (const anim of ANIMATIONS) {
			expect(anim.emoji.length).toBeGreaterThan(0);
			expect(anim.label.length).toBeGreaterThan(0);
			expect(anim.intervalMs).toBeGreaterThan(0);
			// No internal pipeline jargon in labels
			expect(anim.label.toLowerCase()).not.toContain("selecting");
		}
	});

	it("loader options use fixed emoji + cycling dots", () => {
		const opts = animationLoaderOptions("reading");
		expect(opts.frames).toEqual(["📖  Reading.", "📖  Reading..", "📖  Reading...", "📖  Reading.."]);
		// Hint-only message (label is in the frames)
		expect(formatAnimationMessage("reading")).toBe("");
		expect(formatAnimationMessage("reading", { hint: "esc to interrupt" })).toBe("esc to interrupt");

		const voidOpts = animationLoaderOptions("staring-into-void");
		expect(voidOpts.frames[0]).toBe("🌌  Staring into the void.");
		expect(voidOpts.frames[2]).toBe("🌌  Staring into the void...");
		// Same emoji on every frame — motion is dots only
		expect(voidOpts.frames.every((f) => f.startsWith("🌌"))).toBe(true);
	});

	it("maps tools to animations", () => {
		expect(resolveAnimationFromToolName("read")).toBe("reading");
		expect(resolveAnimationFromToolName("write")).toBe("writing");
		expect(resolveAnimationFromToolName("edit")).toBe("editing");
		expect(resolveAnimationFromToolName("bash")).toBe("running");
		expect(resolveAnimationFromToolName("grep")).toBe("searching");
		expect(resolveAnimationFromToolName("memory")).toBe("updating");
	});

	it("normalizes legacy names and keeps easter egg ids", () => {
		expect(normalizeAnimationId("selecting-tools")).toBe("working");
		expect(normalizeAnimationId("vibing")).toBe("vibing");
		expect(normalizeAnimationId("caffeinated")).toBe("caffeinated");
		expect(normalizeAnimationId("reasoning")).toBe("thinking");
		expect(normalizeAnimationId("patching")).toBe("editing");
		expect(normalizeAnimationId("reading-docs")).toBe("reading");
	});

	it("maps bash text heuristics", () => {
		expect(resolveAnimationFromText("cat README.md")).toBe("reading");
		expect(resolveAnimationFromText("echo hi > out.txt")).toBe("writing");
		expect(resolveAnimationFromText("sed -i s/a/b/ file.ts")).toBe("editing");
		expect(resolveAnimationFromText("rg foo src")).toBe("searching");
	});

	it("file-tool emojis are distinct", () => {
		const ids = ["reading", "writing", "editing", "updating"] as const;
		const first = ids.map((id) => getAnimation(id).emoji);
		expect(new Set(first).size).toBe(4);
	});

	it("rarely picks easter eggs for working/thinking and keeps them sticky", () => {
		// Force egg on first roll (random < chance), then keep sticky.
		let calls = 0;
		const rng = () => {
			calls++;
			// first call: chance check → 0 always triggers egg; second: index pick
			return calls === 1 ? 0 : 0;
		};
		const first = pickStatusAnimation("working", undefined, rng);
		expect(isEasterEggAnimation(first.id)).toBe(true);
		expect(getAnimation(first.id).easterEggOf).toBe("working");
		expect(first.stickyEgg).toBe(first.id);

		const second = pickStatusAnimation("working", first.stickyEgg, () => 0.99);
		expect(second.id).toBe(first.id);

		// Tool phase clears sticky eggs
		const tool = pickStatusAnimation("reading", first.stickyEgg, () => 0);
		expect(tool.id).toBe("reading");
		expect(tool.stickyEgg).toBeUndefined();
	});

	it("keeps plain Working when random is above the 40% egg threshold", () => {
		const picked = pickStatusAnimation("working", undefined, () => 0.41);
		expect(picked.id).toBe("working");
		expect(picked.stickyEgg).toBeUndefined();
	});

	it("targets about 4 eggs per 10 Working picks at chance 0.4", () => {
		// Deterministic sequence: 0.0–0.9 stepped → 4 values < 0.4 → eggs
		let i = 0;
		const values = [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95];
		let eggs = 0;
		for (let n = 0; n < 10; n++) {
			const rng = () => {
				// first call = chance roll, later calls = egg index (unused if no egg)
				const v = values[i % values.length]!;
				i++;
				return v;
			};
			// fresh sticky each time = new "phase start"
			const picked = pickStatusAnimation("working", undefined, rng);
			if (picked.stickyEgg) eggs++;
		}
		expect(eggs).toBe(4);
	});
});
