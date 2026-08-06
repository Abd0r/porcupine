/**
 * Agent-home .env loading.
 *
 * Porcupine loads `<agentDir>/.env` at CLI startup so secrets and tuning
 * variables (e.g. PORCUPINE_TELEGRAM_TOKEN, PORCUPINE_TELEGRAM_ALLOW) can be
 * stored in a chmod-600 file instead of the shell profile. Semantics follow
 * dotenv: existing process.env values win, lines are KEY=VALUE with # comments,
 * single/double quotes, and an optional `export` prefix. Missing files are not
 * an error.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ENV_AGENT_DIR = "PORCUPINE_CODING_AGENT_DIR";
const CONFIG_DIR_NAME = ".porcupine";

/** Parse dotenv-style content into [key, value] pairs, in order. */
export function parseEnvFile(content: string): Array<[string, string]> {
	const pairs: Array<[string, string]> = [];
	for (const rawLine of content.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const withoutExport = line.startsWith("export ") ? line.slice(7).trimStart() : line;
		const eq = withoutExport.indexOf("=");
		if (eq <= 0) continue; // no '=' or empty key
		const key = withoutExport.slice(0, eq).trim();
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
		let value = withoutExport.slice(eq + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
			(value.startsWith("'") && value.endsWith("'") && value.length >= 2)
		) {
			value = value.slice(1, -1);
		} else {
			// Strip trailing inline comments on unquoted values.
			const hash = value.indexOf(" #");
			if (hash >= 0) value = value.slice(0, hash).trimEnd();
		}
		pairs.push([key, value]);
	}
	return pairs;
}

/**
 * Load `<agentDir>/.env` into process.env, without overriding variables that
 * are already set (explicit shell/env wins over the file).
 */
export function loadEnvFile(agentDir: string): void {
	const filePath = join(agentDir, ".env");
	if (!existsSync(filePath)) return;
	let content: string;
	try {
		content = readFileSync(filePath, "utf8");
	} catch {
		return;
	}
	for (const [key, value] of parseEnvFile(content)) {
		if (process.env[key] === undefined) {
			process.env[key] = value;
		}
	}
}

/**
 * Resolve the agent dir from the CURRENT environment and load its .env.
 * Intended to run before anything else at CLI startup; the .env cannot change
 * the agent dir itself (that would be a chicken-and-egg loop).
 */
export function loadAgentEnvFile(): void {
	const envDir = process.env[ENV_AGENT_DIR];
	const agentDir = envDir
		? envDir.startsWith("~")
			? join(homedir(), envDir.slice(1))
			: envDir
		: join(homedir(), CONFIG_DIR_NAME, "agent");
	loadEnvFile(agentDir);
}
