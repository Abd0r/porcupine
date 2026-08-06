import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SessionManager } from "../src/core/session-manager.ts";
import { BUILTIN_SLASH_COMMANDS } from "../src/core/slash-commands.ts";
import { parseRefreshCommand } from "../src/modes/interactive/refresh-command.ts";

describe("/refresh", () => {
	it("maps bare refresh, skill, and all to a full Porcupine reload", () => {
		expect(parseRefreshCommand("/refresh")).toEqual({ kind: "reload" });
		expect(parseRefreshCommand("/refresh skill")).toEqual({ kind: "reload" });
		expect(parseRefreshCommand("/refresh skills")).toEqual({ kind: "reload" });
		expect(parseRefreshCommand("/refresh all")).toEqual({ kind: "reload" });
	});

	it("rejects unknown targets", () => {
		expect(parseRefreshCommand("/refresh source")).toEqual({
			kind: "invalid",
			message: "Usage: /refresh [skill|all]",
		});
	});

	it("is advertised as a built-in slash command", () => {
		expect(BUILTIN_SLASH_COMMANDS).toContainEqual({
			name: "refresh",
			description: "Rebuild whole Porcupine runtime and resume this session",
			argumentHint: "[skill|all]",
		});
	});
});

describe("SessionManager.forceFlushToDisk (needed by /refresh)", () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const d of dirs) {
			rmSync(d, { recursive: true, force: true });
		}
		dirs.length = 0;
	});

	it("writes the session file even before any assistant message", () => {
		const dir = mkdtempSync(join(tmpdir(), "porcupine-refresh-flush-"));
		dirs.push(dir);
		const sm = SessionManager.create(dir, dir);
		sm.appendMessage({ role: "user", content: "hello before assistant", timestamp: Date.now() } as any);

		const pathBefore = sm.getSessionFile();
		expect(pathBefore).toBeTruthy();
		// Normal path defers first write until an assistant reply exists.
		expect(existsSync(pathBefore!)).toBe(false);

		const flushed = sm.forceFlushToDisk();
		expect(flushed).toBe(pathBefore);
		expect(existsSync(flushed!)).toBe(true);
		const body = readFileSync(flushed!, "utf8");
		expect(body).toContain("hello before assistant");

		// Reopen must restore the user turn so /refresh can resume.
		const reopened = SessionManager.open(flushed!);
		const messages = reopened.buildSessionContext().messages;
		expect(messages.some((m) => m.role === "user")).toBe(true);
	});
});
