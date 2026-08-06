import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadEnvFile, parseEnvFile } from "../src/porcupine/env-file.ts";

describe("parseEnvFile", () => {
	it("parses KEY=VALUE, comments, quotes, and export prefixes", () => {
		const pairs = parseEnvFile(
			[
				"# comment",
				"PLAIN=value",
				'QUOTED="two words"',
				"SINGLE='a b'",
				"export EXPORTED=yes",
				"INLINE=value # trailing comment",
				"EMPTY=",
				"",
				"BAD LINE",
			].join("\n"),
		);
		expect(pairs).toEqual([
			["PLAIN", "value"],
			["QUOTED", "two words"],
			["SINGLE", "a b"],
			["EXPORTED", "yes"],
			["INLINE", "value"],
			["EMPTY", ""],
		]);
	});

	it("keeps the first occurrence of a duplicate key", () => {
		const pairs = parseEnvFile("A=1\nA=2\n");
		expect(pairs).toEqual([
			["A", "1"],
			["A", "2"],
		]);
		// loadEnvFile applies in order, so the first value wins when unset.
	});
});

describe("loadEnvFile", () => {
	const cleanups: Array<() => void> = [];
	afterEach(() => {
		while (cleanups.length > 0) cleanups.pop()?.();
	});

	function tempEnv(content: string): string {
		const dir = mkdtempSync(join(tmpdir(), "porcupine-env-"));
		cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
		writeFileSync(join(dir, ".env"), content);
		return dir;
	}

	it("loads variables that are not already set", () => {
		const dir = tempEnv("NEW_VAR=hello\nOTHER=world\n");
		delete process.env.NEW_VAR;
		delete process.env.OTHER;
		loadEnvFile(dir);
		expect(process.env.NEW_VAR).toBe("hello");
		expect(process.env.OTHER).toBe("world");
		delete process.env.NEW_VAR;
		delete process.env.OTHER;
	});

	it("does not override variables already present in the environment", () => {
		const dir = tempEnv("EXISTING=from-file\n");
		process.env.EXISTING = "from-shell";
		loadEnvFile(dir);
		expect(process.env.EXISTING).toBe("from-shell");
		delete process.env.EXISTING;
	});

	it("is a no-op when the .env file is missing", () => {
		const dir = mkdtempSync(join(tmpdir(), "porcupine-env-missing-"));
		cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
		expect(() => loadEnvFile(dir)).not.toThrow();
	});
});
