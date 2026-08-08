/**
 * Bug-proof: rm guard regex only matches clustered short flags, so split/long
 * flag forms (`rm -f -r`, `rm --recursive --force`) escape detection entirely
 * and are approved as "safe" in Normal mode without any confirmation.
 */
import { describe, expect, it } from "vitest";
import { type BashGuardDecision, detectDangerousCommand, guardBashCommand } from "../src/porcupine/auto-mode.ts";

describe("rm-rf detection covers split and long flag forms", () => {
	it("clustered short flags are detected (control)", () => {
		expect(detectDangerousCommand("rm -rf /etc")).not.toBeNull();
		expect(detectDangerousCommand("rm -r -f /etc")).not.toBeNull();
	});

	it("split flags rm -f -r escape detection (BUG: should match)", () => {
		expect(detectDangerousCommand("rm -f -r /etc")).not.toBeNull();
	});

	it("long flags rm --recursive --force escape detection (BUG: should match)", () => {
		expect(detectDangerousCommand("rm --recursive --force /etc")).not.toBeNull();
	});
});

describe("guardBashCommand approves the escaping forms in Normal mode", () => {
	const modelRuntime = {} as never;
	const model = undefined;

	async function decide(command: string): Promise<BashGuardDecision> {
		return guardBashCommand({
			command,
			mode: "normal",
			modelRuntime,
			model,
			cwd: "/Users/tester/project",
			protectedPaths: ["/", "/etc", "/usr", "/bin", "/sbin", "/var", "/Library", "/System", "/Applications"],
		});
	}

	it("rm -rf /etc is hardline-blocked (control)", async () => {
		const d = await decide("rm -rf /etc");
		expect(d.approved).toBe(false);
		expect(d.via).toBe("hardline");
	});

	it("rm -f -r /etc is hardline-blocked (BUG: currently approved)", async () => {
		const d = await decide("rm -f -r /etc");
		expect(d.approved).toBe(false);
	});
});
