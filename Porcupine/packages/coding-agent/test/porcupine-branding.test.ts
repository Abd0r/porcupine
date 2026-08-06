import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { printHelp } from "../src/cli/args.ts";
import { APP_NAME, APP_TITLE, CONFIG_DIR_NAME, ENV_AGENT_DIR, ENV_SESSION_DIR, getAgentDir } from "../src/config.ts";

const testDirectory = dirname(fileURLToPath(import.meta.url));

afterEach(() => {
	vi.restoreAllMocks();
});

describe("Porcupine product identity", () => {
	it("owns the visible application and configuration names", () => {
		expect(APP_NAME).toBe("porcupine");
		expect(APP_TITLE).toBe("Porcupine");
		expect(CONFIG_DIR_NAME).toBe(".porcupine");
		expect(ENV_AGENT_DIR).toBe("PORCUPINE_CODING_AGENT_DIR");
		expect(ENV_SESSION_DIR).toBe("PORCUPINE_CODING_AGENT_SESSION_DIR");
		expect(getAgentDir()).toMatch(/[\\/]\.porcupine[\\/]agent$/);
	});

	it("ships the Porcupine command without a legacy public binary", () => {
		const packageJson = JSON.parse(readFileSync(join(testDirectory, "..", "package.json"), "utf8")) as {
			bin: Record<string, string>;
		};
		expect(packageJson.bin).toEqual({ porcupine: "dist/cli.js" });
	});

	it("prints help without exposing the substrate brand", () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});

		printHelp();

		const output = log.mock.calls.map((call) => call.join(" ")).join("\n");
		expect(output).toContain("Porcupine");
		expect(output).toContain("porcupine [options]");
		expect(output).toContain("~/.porcupine/agent");
		expect(output).not.toMatch(/\bpi\b/i);
		expect(output).not.toMatch(/^\s*PI_/m);
	});
});
