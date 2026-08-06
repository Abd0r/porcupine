import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { syncStockAgentFiles } from "../src/porcupine/stock-sync.ts";

const tempDirs: string[] = [];

function makeDirs() {
	const source = mkdtempSync(join(tmpdir(), "stock-sync-src-"));
	const dest = mkdtempSync(join(tmpdir(), "stock-sync-dest-"));
	// Isolate the sync state per test (a real ~/.porcupine state file would leak).
	const stateFile = join(mkdtempSync(join(tmpdir(), "stock-sync-state-")), "state.json");
	tempDirs.push(source, dest, join(stateFile, ".."));
	return { source, dest, stateFile };
}

function write(dir: string, file: string, content: string): void {
	writeFileSync(join(dir, file), content, "utf8");
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("syncStockAgentFiles", () => {
	it("adds missing files and records their hash", () => {
		const { source, dest, stateFile } = makeDirs();
		write(source, "PROMPT.md", "hello stock");
		const report = syncStockAgentFiles({ sourceDir: source, destDir: dest, stateFile });
		expect(report.added).toEqual(["PROMPT.md"]);
		expect(readFileSync(join(dest, "PROMPT.md"), "utf8")).toBe("hello stock");
	});

	it("updates files the user has NOT modified since the last sync", () => {
		const { source, dest, stateFile } = makeDirs();
		write(source, "AGENTS.md", "stock v1");
		syncStockAgentFiles({ sourceDir: source, destDir: dest, stateFile }); // adds + records hash of v1

		write(source, "AGENTS.md", "stock v2 (new)");
		const report = syncStockAgentFiles({ sourceDir: source, destDir: dest, stateFile });
		expect(report.updated).toEqual(["AGENTS.md"]);
		expect(readFileSync(join(dest, "AGENTS.md"), "utf8")).toBe("stock v2 (new)");
	});

	it("SKIPS files the user has edited (never clobbers)", () => {
		const { source, dest, stateFile } = makeDirs();
		write(source, "PROMPT.md", "stock v1");
		syncStockAgentFiles({ sourceDir: source, destDir: dest, stateFile });

		write(dest, "PROMPT.md", "my custom prompt"); // user edit
		write(source, "PROMPT.md", "stock v2");
		const report = syncStockAgentFiles({ sourceDir: source, destDir: dest, stateFile });
		expect(report.skipped).toEqual(["PROMPT.md"]);
		expect(readFileSync(join(dest, "PROMPT.md"), "utf8")).toBe("my custom prompt");
	});

	it("skips unknown-first-run differences unless forced", () => {
		const { source, dest, stateFile } = makeDirs();
		write(source, "SYSTEM.md", "stock");
		write(dest, "SYSTEM.md", "user old"); // no prior sync state → cannot tell → skip
		const report = syncStockAgentFiles({ sourceDir: source, destDir: dest, stateFile });
		expect(report.skipped).toEqual(["SYSTEM.md"]);
		expect(readFileSync(join(dest, "SYSTEM.md"), "utf8")).toBe("user old");

		// --force overwrites it
		const forced = syncStockAgentFiles({ sourceDir: source, destDir: dest, force: true, stateFile });
		expect(forced.forced).toEqual(["SYSTEM.md"]);
		expect(readFileSync(join(dest, "SYSTEM.md"), "utf8")).toBe("stock");
	});
});
