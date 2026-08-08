/**
 * Persistent user-built tools (`<agentDir>/user-tools.json`).
 *
 * A distilled **tool** (kind:"tool") is persisted as a lightweight record and
 * mapped to a ToolDefinition at session bootstrap, so tools written here are
 * registered and discoverable next session. Unknown/corrupt entries are skipped
 * with a warning, never a crash.
 *
 * Record shape:
 *   { name, description, parameters, command, cwd? }
 *
 * `parameters` is a TypeBox schema object; `command` is a shell command template
 * with `{{arg}}` placeholders for each parameter name.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { TSchema } from "typebox";
import { Type } from "typebox";
import type { ToolDefinition } from "../core/extensions/types.ts";

/** Minimal ToolDefinition shape produced from a persisted user-tool record. */
export interface UserDistilledToolDefinition {
	name: string;
	description: string;
	parameters: TSchema;
	execute: (
		toolCallId: string,
		params: Record<string, unknown>,
	) => Promise<{
		content: Array<{ type: "text"; text: string }>;
		details: { command: string };
	}>;
}

/** Path to the user-tools registry inside the agent-home. */
export function userToolsPath(agentDir: string): string {
	return join(agentDir, "user-tools.json");
}

export interface UserToolParams {
	[key: string]: TSchema;
}

export interface UserToolRecord {
	name: string;
	description: string;
	/** TypeBox parameter schema (object of named sub-schemas). */
	parameters: UserToolParams;
	/** Shell command template; `{{name}}` is replaced with the escaped arg value. */
	command: string;
	/** Optional working directory for the command. */
	cwd?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Load user-built tools. Skips unknown/corrupt entries (logs a warning) and
 * never throws for a malformed file.
 */
export function loadUserTools(agentDir: string, warn: (msg: string) => void = console.warn): UserToolRecord[] {
	const path = userToolsPath(agentDir);
	if (!existsSync(path)) return [];

	let raw: string;
	try {
		raw = readFileSync(path, "utf-8");
	} catch (error) {
		warn(`Cannot read user-tools.json (${path}): ${error instanceof Error ? error.message : String(error)}`);
		return [];
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		warn(`user-tools.json (${path}) is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
		return [];
	}

	if (!Array.isArray(parsed)) {
		warn(`user-tools.json (${path}): expected a top-level array, got ${typeof parsed}`);
		return [];
	}

	const tools: UserToolRecord[] = [];
	for (const item of parsed) {
		if (!isRecord(item) || typeof item.name !== "string" || typeof item.description !== "string") {
			warn(`user-tools.json (${path}): skipping corrupt entry (missing name/description)`);
			continue;
		}
		if (typeof item.command !== "string" || !isRecord(item.parameters)) {
			warn(`user-tools.json (${path}): skipping "${item.name}": missing command or parameters`);
			continue;
		}
		const params: UserToolParams = {};
		for (const [key, schema] of Object.entries(item.parameters)) {
			if (!isRecord(schema) || typeof schema.type !== "string") {
				warn(`user-tools.json (${path}): skipping "${item.name}": invalid parameter "${key}"`);
				continue;
			}
			params[key] = schema as TSchema;
		}
		tools.push({
			name: item.name,
			description: item.description,
			parameters: params,
			command: item.command,
			...(typeof item.cwd === "string" ? { cwd: item.cwd } : {}),
		});
	}
	return tools;
}

/**
 * Append a user-tool record to the registry (creating the file if needed).
 * Fails cleanly when a tool with the same name already exists unless `force`.
 */
export function writeUserTool(agentDir: string, record: UserToolRecord, opts: { force?: boolean } = {}): void {
	const path = userToolsPath(agentDir);
	const existing = loadUserTools(agentDir, () => undefined);
	if (existing.some((t) => t.name === record.name) && !opts.force) {
		throw new Error(`Tool already exists: ${record.name}. Pass force:true to overwrite.`);
	}
	const next = [...existing.filter((t) => t.name !== record.name), record];
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8" });
}

/** Build a TypeBox object schema from a record's named parameter schemas. */
function schemaFromParams(params: UserToolParams) {
	const entries: Record<string, TSchema> = {};
	for (const [key, schema] of Object.entries(params)) {
		entries[key] = Type.Optional(schema);
	}
	return Type.Object(entries as Parameters<typeof Type.Object>[0]);
}

/**
 * Escape a value for safe single-quoted shell embedding.
 */
function shellQuote(value: unknown): string {
	const s = String(value ?? "");
	return `'${s.replace(/'/g, "'\\''")}'`;
}

/**
 * Load user-built tools and map each valid record to a full ToolDefinition for
 * registration through `customTools`. Corrupt records are skipped with a warning.
 */
export function loadUserToolDefinitions(
	agentDir: string,
	warn: (msg: string) => void = console.warn,
): ToolDefinition[] {
	const records = loadUserTools(agentDir, warn);
	const defs: ToolDefinition[] = [];
	for (const record of records) {
		try {
			const minimal = createToolDefinitionFromRecord(record);
			defs.push(toFullDefinition(minimal));
		} catch (error) {
			warn(`Skipping user tool "${record.name}": ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	return defs;
}

function toFullDefinition(minimal: UserDistilledToolDefinition): ToolDefinition {
	return {
		name: minimal.name,
		label: minimal.name,
		description: minimal.description,
		promptSnippet: `User-built tool: ${minimal.description}`,
		parameters: minimal.parameters,
		execute: async (toolCallId, params) => {
			const result = await minimal.execute(
				toolCallId as unknown as string,
				params as unknown as Record<string, unknown>,
			);
			return result as Awaited<ReturnType<NonNullable<ToolDefinition["execute"]>>>;
		},
	};
}

/**
 * Map a persisted user-tool record to a minimal ToolDefinition whose execute
 * runs the recorded command via `exec`, substituting `{{param}}` placeholders.
 */
export function createToolDefinitionFromRecord(record: UserToolRecord): UserDistilledToolDefinition {
	const params = record.parameters ?? {};
	const names = Object.keys(params);
	return {
		name: record.name,
		description: record.description,
		parameters: schemaFromParams(params),
		execute: async (_id, args) => {
			let command = record.command;
			for (const name of names) {
				command = command.split(`{{${name}}}`).join(shellQuote((args as Record<string, unknown>)?.[name]));
			}
			const { execFile } = await import("node:child_process");
			const { promisify } = await import("node:util");
			const execFileAsync = promisify(execFile);
			const { stdout, stderr } = await execFileAsync("sh", ["-c", command], {
				cwd: record.cwd,
				encoding: "utf8",
				maxBuffer: 8 * 1024 * 1024,
			});
			const text = [stderr?.trim() ? stderr : "", stdout].filter(Boolean).join("\n");
			return {
				content: [{ type: "text", text: text || "(no output)" }],
				details: { command },
			};
		},
	};
}
