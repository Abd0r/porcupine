import { describe, expect, it } from "vitest";
import { describeComputerUseBackend, normalizeComputerUsePlatform } from "../src/core/tools/computer-use-platform.ts";

describe("computer use platform capabilities", () => {
	it("normalizes supported and unknown platforms", () => {
		expect(normalizeComputerUsePlatform("darwin")).toBe("darwin");
		expect(normalizeComputerUsePlatform("linux")).toBe("linux");
		expect(normalizeComputerUsePlatform("win32")).toBe("win32");
		expect(normalizeComputerUsePlatform("freebsd")).toBe("unsupported");
	});

	it("keeps Linux and Windows unavailable until runtime adapters are verified", () => {
		for (const platform of ["linux", "win32"]) {
			const status = describeComputerUseBackend(platform);
			expect(status.available).toBe(false);
			expect(status.capabilities).toContain("observe");
			expect(status.requirements.length).toBeGreaterThan(0);
		}
	});

	it("reports macOS native capabilities", () => {
		const status = describeComputerUseBackend("darwin");
		expect(status.available).toBe(true);
		expect(status.backend).toBe("macOS native");
		expect(status.requirements).toContain("Accessibility permission");
	});
});
