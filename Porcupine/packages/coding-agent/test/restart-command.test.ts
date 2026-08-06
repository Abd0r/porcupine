import { describe, expect, it } from "vitest";
import { BUILTIN_SLASH_COMMANDS } from "../src/core/slash-commands.ts";
import { buildRestartArgv, parseRestartCommand } from "../src/modes/interactive/restart-command.ts";

describe("/restart", () => {
	it("parses bare restart", () => {
		expect(parseRestartCommand("/restart")).toEqual({ kind: "restart" });
		expect(parseRestartCommand("/restart  ")).toEqual({ kind: "restart" });
	});

	it("rejects extra args", () => {
		expect(parseRestartCommand("/restart now")).toEqual({
			kind: "invalid",
			message: "Usage: /restart",
		});
	});

	it("is advertised as a built-in slash command", () => {
		expect(BUILTIN_SLASH_COMMANDS).toContainEqual({
			name: "restart",
			description: "Fully restart Porcupine process and resume this session",
		});
	});

	it("builds resume argv with session id", () => {
		expect(
			buildRestartArgv({
				entryPath: "/app/dist/cli.js",
				sessionId: "abc-123",
				sessionFile: "/sessions/abc.jsonl",
				usesDefaultSessionDir: true,
			}),
		).toEqual(["/app/dist/cli.js", "--session", "abc-123"]);
	});

	it("includes session-dir when non-default", () => {
		expect(
			buildRestartArgv({
				entryPath: "/app/dist/cli.js",
				sessionId: "abc-123",
				sessionDir: "/custom/sessions",
				usesDefaultSessionDir: false,
			}),
		).toEqual(["/app/dist/cli.js", "--session-dir", "/custom/sessions", "--session", "abc-123"]);
	});
});
