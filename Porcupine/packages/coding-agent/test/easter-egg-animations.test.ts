import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TUI } from "@porcupineai/tui";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ArminComponent } from "../src/modes/interactive/components/armin.ts";
import { DaxnutsComponent } from "../src/modes/interactive/components/daxnuts.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";

/** A fake TUI that just records render requests (no real terminal needed). */
function createFakeTui(): { tui: TUI; requestRender: ReturnType<typeof vi.fn> } {
	const requestRender = vi.fn();
	return { tui: { requestRender } as unknown as TUI, requestRender };
}

/** Typed access to private fields of a component for white-box testing. */
function getInterval(component: object): ReturnType<typeof setInterval> | null {
	return (component as any).interval;
}

/** Deterministic PRNG so animation frames are reproducible across runs. */
function seedRandom(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		// xorshift32 — stable, no floating point drift
		s ^= s << 13;
		s ^= s >>> 17;
		s ^= s << 5;
		return ((s >>> 0) % 100000) / 100000;
	};
}

/** Strip ANSI escapes so assertions work on plain text. */
function stripAnsi(value: string): string {
	return value.replace(/\x1b\[[0-9;]*m/g, "");
}

beforeAll(() => {
	initTheme("dark");
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("ArminComponent", () => {
	it("renders the 'ARMIN SAYS HI' banner on every frame", () => {
		vi.useFakeTimers();
		const { tui } = createFakeTui();
		const component = new ArminComponent(tui, { effect: "fade" });

		const lines = component.render(80);
		const text = lines.map(stripAnsi).join("\n");
		expect(text).toContain("ARMIN SAYS HI");

		component.dispose();
	});

	it("caches identical frames and re-renders on invalidate", () => {
		vi.useFakeTimers();
		const { tui } = createFakeTui();
		const component = new ArminComponent(tui, { effect: "scanline" });

		const first = component.render(80);
		const second = component.render(80);
		// Same logical frame → cached reference
		expect(second).toBe(first);

		// invalidate() must force a fresh render (new array reference)
		component.invalidate();
		const third = component.render(80);
		expect(third).not.toBe(first);

		component.dispose();
	});

	it("every effect terminates within a bounded number of frames", () => {
		// Regression guard: each effect must stop its setInterval after completion
		// rather than running forever (see the rain-effect hang fixed below).
		vi.useFakeTimers();
		const { tui, requestRender } = createFakeTui();
		// Deterministic randomness so the result is stable in CI.
		vi.spyOn(Math, "random").mockImplementation(seedRandom(20240804));

		const effects = ["typewriter", "scanline", "rain", "fade", "crt", "glitch", "dissolve"] as const;
		for (const effect of effects) {
			requestRender.mockClear();
			const component = new ArminComponent(tui, { effect });

			// Advance far enough for even the slowest effect (rain ≈ 168 frames @ 30fps ≈ 5.6s)
			vi.advanceTimersByTime(10_000);

			expect(getInterval(component), `effect "${effect}" should have stopped its timer`).toBeNull();

			component.dispose();
		}
	});

	it("the rain effect terminates even when columns have empty space at the top", () => {
		// Direct regression test for the bug where a column whose topmost non-space
		// pixel sits above row 0 never reached `settled >= DISPLAY_HEIGHT`, causing
		// the drop to fall forever through empty space and the interval to never clear.
		vi.useFakeTimers();
		vi.spyOn(Math, "random").mockImplementation(seedRandom(7));
		const { tui } = createFakeTui();
		const component = new ArminComponent(tui, { effect: "rain" });

		// The Armin image has empty space at the top of many columns, which is
		// exactly the configuration that triggered the infinite-rain hang.
		vi.advanceTimersByTime(8_000);
		expect(getInterval(component)).toBeNull();

		component.dispose();
	});

	it("final grid matches the rendered image after completion", () => {
		vi.useFakeTimers();
		vi.spyOn(Math, "random").mockImplementation(seedRandom(99));
		const { tui } = createFakeTui();
		const component = new ArminComponent(tui, { effect: "fade" });

		vi.advanceTimersByTime(5_000);
		expect(getInterval(component)).toBeNull();

		const finalGrid: string[][] = (component as any).finalGrid;
		const currentGrid: string[][] = (component as any).currentGrid;
		expect(currentGrid).toEqual(finalGrid);
		component.dispose();
	});

	it("dispose clears the animation interval", () => {
		vi.useFakeTimers();
		const { tui } = createFakeTui();
		const component = new ArminComponent(tui, { effect: "fade" });
		expect(getInterval(component)).not.toBeNull();
		component.dispose();
		expect(getInterval(component)).toBeNull();
	});
});

describe("DaxnutsComponent", () => {
	it("terminates after the configured number of ticks", () => {
		vi.useFakeTimers();
		const { tui } = createFakeTui();
		const component = new DaxnutsComponent(tui);

		// maxTicks = 25 at 80ms each → ~2s is enough
		vi.advanceTimersByTime(3_000);
		expect(getInterval(component)).toBeNull();
		component.dispose();
	});

	it("progressively reveals the image then shows it fully", () => {
		vi.useFakeTimers();
		const { tui } = createFakeTui();
		const component = new DaxnutsComponent(tui);

		// Early frame (tick 0): only the scanline reveal has started; the caption
		// fades in later (after tick > maxTicks*0.6), so it must not appear yet.
		const first = component.render(80).map(stripAnsi).join("\n");
		expect(first).not.toContain("Free Kimi K2.5 via OpenCode Zen");
		// A scanline character should be mid-reveal
		expect(/[▓▒░▀▄█]/.test(first)).toBe(true);

		// After completion: the full image and caption are visible
		vi.advanceTimersByTime(3_000);
		const after = component.render(80).map(stripAnsi).join("\n");
		expect(/[▓▒░▀▄█]/.test(after)).toBe(true);
		expect(after).toContain("Free Kimi K2.5 via OpenCode Zen");
		expect(after).toContain("Powered by daxnuts");
		component.dispose();
	});

	it("dispose clears the animation interval", () => {
		vi.useFakeTimers();
		const { tui } = createFakeTui();
		const component = new DaxnutsComponent(tui);
		expect(getInterval(component)).not.toBeNull();
		component.dispose();
		expect(getInterval(component)).toBeNull();
	});

	it("renders at a narrow width without throwing", () => {
		vi.useFakeTimers();
		const { tui } = createFakeTui();
		const component = new DaxnutsComponent(tui);
		const root = mkdtempSync(join(tmpdir(), "porcupine-dax-"));
		const lines = component.render(40).map(stripAnsi);
		expect(lines.length).toBeGreaterThan(0);
		expect(root).toBeTruthy();
		component.dispose();
	});
});
