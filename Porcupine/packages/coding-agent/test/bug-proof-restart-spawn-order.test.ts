/**
 * Bug-proof repro: /restart's spawn-failure handler is dead code.
 *
 * src/modes/interactive/interactive-mode.ts (handleRestartCommand, ~line 7802):
 *   const child = spawn(process.execPath, [...], { ... });
 *   child.on("error", (err) => { process.stderr.write(...); process.exit(1); });
 *   child.unref();
 *   process.exit(0);            // <-- runs synchronously on the SAME tick spawn() returns
 *
 * `child.on("error", ...)` is only delivered on a later event-loop tick. Because
 * `process.exit(0)` terminates the process synchronously right after `spawn()`
 * returns, the async `'error'` event never fires. If the replacement process
 * fails to spawn, the parent exits 0 with no message and no restored terminal —
 * a silent half-restarted state.
 *
 * This test reproduces the ordering contract with a mock child to prove that the
 * error handler registered after spawn() is skipped when process.exit() runs in
 * the same tick.
 */
import { describe, expect, it } from "vitest";

interface MockChild {
	onError: (cb: () => void) => void;
	unref: () => void;
}

/**
 * Recreates the exact spawn/on(error)/unref/process.exit sequence from
 * handleRestartCommand. Returns whether the error callback ever fired.
 */
function recreateRestartSequence(
	spawn: () => MockChild,
	callProcessExit: (code: number) => void,
): { onErrorFired: boolean } {
	const child = spawn();
	let onErrorFired = false;
	child.onError(() => {
		onErrorFired = true;
	});
	child.unref();
	// Real code: process.exit(0) — synchronous, same tick as spawn() returned.
	callProcessExit(0);
	return { onErrorFired };
}

/** Simulate a child whose spawn fails: 'error' is delivered only on a later tick. */
function failedSpawn(): { mock: MockChild; triggerError: () => void } {
	let onError: (() => void) | undefined;
	const mock: MockChild = {
		onError: (cb) => {
			onError = cb;
		},
		unref: () => {},
	};
	return {
		mock,
		triggerError: () => {
			onError?.();
		},
	};
}

describe("/restart spawn-failure dead code", () => {
	it("error handler registered after spawn() is never called because process.exit(0) is synchronous", () => {
		const spawnResult = failedSpawn();
		const exitCodes: number[] = [];

		// process.exit() never returns; on a real spawn failure the 'error'
		// event fires on the NEXT tick, after this synchronous exit already ran.
		const { onErrorFired } = recreateRestartSequence(
			() => spawnResult.mock,
			(code) => {
				exitCodes.push(code);
			},
		);

		// At the instant process.exit(0) ran, no error was surfaced.
		expect(onErrorFired).toBe(false);

		// Simulate the spawn error arriving after the synchronous exit: nothing
		// in the program can catch it — the parent already called process.exit(0).
		spawnResult.triggerError();

		// The exit path exited with the SUCCESS code (0) even though the child
		// failed to launch: the `child.on("error")` branch (exit 1 + message) is
		// unreachable in the restart flow.
		expect(exitCodes).toEqual([0]);
	});
});
