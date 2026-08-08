/**
 * SAFETY PROOF (FIXED): Auto Mode bash gate hardline detection now canonicalizes
 * shell path-equivalences before matching, so obfuscated `rm -rf /` variants that
 * POSIX collapses to root are hardline-blocked (never auto-approvable).
 *
 * Regression basis: previously `rm -rf //`, `/./`, `/../`, `-- /`, and quoted
 * roots all produced hardline:false and were delegated to a classifier that is
 * told to approve most flags, silently wiping the FS. Now the guard normalizes
 * quotes, `//`, `/./`, `/../`, and the `--` terminator before matching so those
 * destructive intents are denied with no human in the loop.
 */
import { describe, expect, it } from "vitest";
import { detectDangerousCommand } from "../src/porcupine/auto-mode.ts";

/** Any hardline match is one that Auto Mode can never approve. */
function isHardline(cmd: string): boolean {
	return detectDangerousCommand(cmd)?.hardline === true;
}

describe("SAFETY PROOF (FIXED): `rm -rf /` hardline survives path equivalences and quoting", () => {
	it("baseline: canonical `rm -rf /` IS hardline", () => {
		expect(isHardline("rm -rf /")).toBe(true);
	});

	it("FIXED: `rm -rf //` (POSIX collapses to /) is hardline", () => {
		expect(isHardline("rm -rf //")).toBe(true);
	});

	it("FIXED: `rm -rf /./` (normalizes to /) is hardline", () => {
		expect(isHardline("rm -rf /./")).toBe(true);
	});

	it("FIXED: `rm -rf /../` (normalizes to /) is hardline", () => {
		expect(isHardline("rm -rf /../")).toBe(true);
	});

	it("FIXED: `rm -rf /../../../../` (resolves to /) is hardline", () => {
		expect(isHardline("rm -rf /../../../../")).toBe(true);
	});

	it("FIXED: `rm -rf -- /` (documented '--' terminator) is hardline", () => {
		expect(isHardline("rm -rf -- /")).toBe(true);
	});

	it("FIXED: quoted roots are hardline", () => {
		expect(isHardline('rm -rf "/"')).toBe(true);
		expect(isHardline("rm -rf '//'")).toBe(true);
	});

	// Variable/command-substitution indirection is still a soft rm-rf flag (not
	// silently approved), but is NOT classified as the hardline root wipe.
	it("residual: variable/substitution indirection is soft-flagged, not hardline", () => {
		expect(detectDangerousCommand("rm -rf $HOME && echo done")?.hardline).toBe(false);
		expect(detectDangerousCommand("rm -rf $(echo /)")?.hardline).toBe(false);
		// It is still DANGEROUS-flagged (never an unsupervised safe pass).
		expect(detectDangerousCommand("rm -rf $HOME && echo done")).not.toBeNull();
	});

	it("residual: `cd / && rm -rf .` is soft-flagged (rm -rf caught), not the root hardline", () => {
		expect(detectDangerousCommand("cd / && rm -rf .")?.hardline).toBe(false);
		expect(detectDangerousCommand("cd / && rm -rf .")).not.toBeNull();
	});
});

describe("SAFETY PROOF: other hardline actions have solid coverage", () => {
	it("OK (solid): `kill -9 -1` IS hardline", () => {
		expect(isHardline("kill -9 -1")).toBe(true);
	});

	it("FIXED: `kill -- -1` (long-form terminator) is hardline", () => {
		expect(isHardline("kill -- -1")).toBe(true);
	});

	it("FIXED: sysv runlevel 0 (halt/poweroff) is hardline", () => {
		expect(isHardline("init 0")).toBe(true);
		expect(isHardline("telinit 0")).toBe(true);
	});

	it("OK (solid): `systemctl poweroff` substring is caught by the word rule", () => {
		expect(isHardline("systemctl poweroff")).toBe(true);
	});

	it("OK (solid): dd device write is hardline, /dev/null is allowed", () => {
		expect(isHardline("dd if=x of=/dev/sda")).toBe(true);
		expect(isHardline("dd if=x of=/dev/mapper/lv-root")).toBe(true);
		expect(detectDangerousCommand("dd if=x of=/dev/null")).toBeNull();
	});
});
