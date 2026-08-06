import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { Loader } from "../src/components/loader.ts";
import type { TUI } from "../src/tui.ts";

function createFakeTui(): { tui: TUI; renders: number } {
	const state = { renders: 0 };
	const tui = {
		requestRender: () => {
			state.renders += 1;
		},
	} as unknown as TUI;
	return {
		tui,
		renders: 0,
		get count() {
			return state.renders;
		},
	} as any;
}

describe("Loader animation", () => {
	afterEach(() => {
		mock.timers.reset();
	});

	it("advances frames over time", () => {
		mock.timers.enable({ apis: ["setInterval"] });
		const { tui } = createFakeTui();
		const loader = new Loader(
			tui,
			(s) => s,
			(s) => s,
			"working",
			{
				frames: ["A", "B", "C", "D"],
				intervalMs: 100,
			},
		);

		assert.match(loader.render(40).join("\n"), /A/);
		mock.timers.tick(100);
		assert.match(loader.render(40).join("\n"), /B/);
		assert.doesNotMatch(loader.render(40).join("\n"), /A /);

		loader.stop();
	});

	it("does not restart when the same indicator is re-applied", () => {
		mock.timers.enable({ apis: ["setInterval"] });
		const { tui } = createFakeTui();
		const frames = ["(🎧) Vibing.", "(🎧) Vibing..", "(🎧) Vibing...", "(🎧) Vibing.."];
		const loader = new Loader(
			tui,
			(s) => s,
			(s) => s,
			"hint",
			{
				frames,
				intervalMs: 100,
			},
		);

		// Advance to frame index 2 ("...")
		mock.timers.tick(200);
		assert.match(loader.render(60).join("\n"), /Vibing\.\.\./);

		// Re-applying identical frames must keep the current frame, not jump back to "."
		loader.setIndicator({ frames, intervalMs: 100 });
		assert.match(loader.render(60).join("\n"), /Vibing\.\.\./);

		mock.timers.tick(100);
		// Next frame in the cycle is ".."
		const text = loader.render(60).join("\n");
		assert.match(text, /Vibing\.\./);
		assert.doesNotMatch(text, /Vibing\.\.\./);

		loader.stop();
	});
});
