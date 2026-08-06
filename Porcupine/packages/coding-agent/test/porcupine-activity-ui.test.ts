import { describe, expect, it, vi } from "vitest";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.ts";

describe("setPorcupineActivity UI wiring (animations.ts)", () => {
	it("does not restart glyphs when the animation id is unchanged", () => {
		const setIndicator = vi.fn();
		const setMessage = vi.fn();
		// Force no easter-egg swap so phase stays "thinking".
		vi.spyOn(Math, "random").mockReturnValue(0.99);
		const fakeThis: any = {
			extensionActivityOverride: undefined,
			activityPhase: "thinking",
			activityEasterEgg: undefined,
			workingMessage: undefined,
			workingIndicatorOptions: undefined,
			workingVisible: true,
			pendingTools: new Map(),
			editor: { focused: true },
			isEditorFocused: () => true,
			activeStatusIndicator: {
				kind: "working",
				setIndicator,
				setMessage,
			},
			session: { isStreaming: true, isCompacting: false, isBashRunning: false },
			ui: { requestRender: vi.fn(), setFocus: vi.fn() },
		};

		// Soft update without explicit showInterruptHint — must still keep the suffix
		// while the agent is streaming.
		(InteractiveMode as any).prototype.setPorcupineActivity.call(fakeThis, "thinking");

		expect(setIndicator).not.toHaveBeenCalled();
		expect(setMessage).toHaveBeenCalled();
		// Message is hint-only; label lives in animated frames
		const message = setMessage.mock.calls[0][0] as string;
		expect(message).toBe("(esc to interrupt)");
		expect(message).not.toMatch(/·/);
		expect(message).not.toMatch(/escape/i);
		expect(fakeThis.activityPhase).toBe("thinking");
		vi.restoreAllMocks();
	});

	it("does not let soft Working stomp a live tool animation", () => {
		const setIndicator = vi.fn();
		const setMessage = vi.fn();
		const fakeThis: any = {
			extensionActivityOverride: undefined,
			activityPhase: "reading",
			activityEasterEgg: undefined,
			workingMessage: undefined,
			workingIndicatorOptions: undefined,
			workingVisible: true,
			pendingTools: new Map([["t1", {}]]),
			editor: { focused: true },
			isEditorFocused: () => true,
			activeStatusIndicator: {
				kind: "working",
				setIndicator,
				setMessage,
			},
			session: { isStreaming: true, isCompacting: false, isBashRunning: false },
			ui: { requestRender: vi.fn(), setFocus: vi.fn() },
		};

		// Soft call (orchestrator step:start / streaming) without force
		(InteractiveMode as any).prototype.setPorcupineActivity.call(fakeThis, "working");

		expect(setIndicator).not.toHaveBeenCalled();
		expect(fakeThis.activityPhase).toBe("reading");
	});

	it("swaps glyphs when the animation id changes", () => {
		const setIndicator = vi.fn();
		const setMessage = vi.fn();
		const fakeThis: any = {
			extensionActivityOverride: undefined,
			activityPhase: "working",
			activityEasterEgg: undefined,
			workingMessage: undefined,
			workingIndicatorOptions: undefined,
			workingVisible: true,
			pendingTools: new Map(),
			editor: { focused: true },
			isEditorFocused: () => true,
			activeStatusIndicator: {
				kind: "working",
				setIndicator,
				setMessage,
			},
			session: { isStreaming: true, isCompacting: false, isBashRunning: false },
			ui: { requestRender: vi.fn(), setFocus: vi.fn() },
		};

		(InteractiveMode as any).prototype.setPorcupineActivity.call(fakeThis, "editing");

		expect(setIndicator).toHaveBeenCalledTimes(1);
		const options = setIndicator.mock.calls[0][0];
		// Fixed emoji + cycling dots: "✏️  Editing." / ".." / "..." / ".."
		expect(options.frames).toEqual(["✏️  Editing.", "✏️  Editing..", "✏️  Editing...", "✏️  Editing.."]);
		const message = setMessage.mock.calls[0][0] as string;
		expect(message).toBe("(esc to interrupt)");
		expect(fakeThis.activityPhase).toBe("editing");
	});
});
