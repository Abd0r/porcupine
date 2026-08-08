/**
 * OS keyring for secrets (OAuth tokens at rest) with a 0600-file fallback.
 *
 * Prefers the platform keychain via its CLI (no native deps):
 * - macOS: `security` (Keychain)
 * - Linux: `secret-tool` (libsecret) when available
 * - Windows: falls back to the encrypted-at-permission file store (PasswordVault
 *   via PowerShell is unreliable across hosts)
 *
 * Fallback store: `~/.porcupine/agent/.secrets.json` with 0600 perms. Secrets
 * are never logged and never committed.
 */

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { lockDirSync } from "./sync-lock.ts";

const SECRETS_FILE = ".secrets.json";

function secretsPath(agentDir: string): string {
	return join(agentDir, SECRETS_FILE);
}

function run(cmd: string, args: string[], input?: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = execFile(cmd, args, { timeout: 10_000 }, (error, stdout) => {
			if (error) reject(error);
			else resolve(stdout.trim());
		});
		if (input !== undefined) {
			child.stdin?.write(input);
			child.stdin?.end();
		}
	});
}

/** Best-effort keychain lookup; resolves undefined when the secret is absent or the CLI is unavailable. */
export async function keychainGet(service: string, account: string): Promise<string | undefined> {
	try {
		if (process.platform === "darwin") {
			return await run("security", ["find-generic-password", "-a", account, "-s", service, "-w"]);
		}
		if (process.platform === "linux") {
			return await run("secret-tool", ["lookup", "service", service, "account", account]);
		}
	} catch {
		return undefined;
	}
	return undefined;
}

/** Store a secret in the OS keychain (best-effort; false when unavailable).
 * Note: the macOS `security` CLI has no stdin mode, so the secret briefly
 * appears in this process's argv (visible via `ps` to the same user during
 * the ~millisecond call). If that is unacceptable, the 0600 file fallback
 * (writeSecretsFile) is the alternative; both stores are readable by the
 * agent only. */
export async function keychainSet(service: string, account: string, secret: string): Promise<boolean> {
	try {
		if (process.platform === "darwin") {
			await run("security", ["add-generic-password", "-a", account, "-s", service, "-w", secret, "-U"]);
			return true;
		}
		if (process.platform === "linux") {
			await run(
				"secret-tool",
				["store", "--label", `Porcupine ${service}`, "service", service, "account", account],
				secret,
			);
			return true;
		}
	} catch {
		return false;
	}
	return false;
}

/** Remove a secret from the OS keychain (best-effort). */
export async function keychainDelete(service: string, account: string): Promise<boolean> {
	try {
		if (process.platform === "darwin") {
			await run("security", ["delete-generic-password", "-a", account, "-s", service]);
			return true;
		}
		if (process.platform === "linux") {
			await run("secret-tool", ["clear", "service", service, "account", account]);
			return true;
		}
	} catch {
		return false;
	}
	return false;
}

interface SecretsFile {
	[service: string]: { [account: string]: string };
}

function readSecretsFile(agentDir: string): SecretsFile {
	try {
		return JSON.parse(readFileSync(secretsPath(agentDir), "utf8")) as SecretsFile;
	} catch {
		return {};
	}
}

function writeSecretsFile(agentDir: string, data: SecretsFile): void {
	const path = secretsPath(agentDir);
	mkdirSync(dirname(path), { recursive: true });
	// Serialize the read-modify-write: without a lock, two concurrent writers
	// lose one secret (last writer wins on the full-file rewrite).
	const release = lockDirSync(dirname(path), {
		lockfilePath: join(dirname(path), ".secrets.lock"),
		realpath: false,
	});
	try {
		const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
		try {
			writeFileSync(temporary, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 });
			renameSync(temporary, path);
		} finally {
			try {
				rmSync(temporary, { force: true });
			} catch {
				// Best-effort cleanup.
			}
		}
	} finally {
		release();
	}
}

/** Read a secret: OS keychain first, 0600 file fallback. */
export async function readSecret(agentDir: string, service: string, account: string): Promise<string | undefined> {
	const fromKeychain = await keychainGet(service, account);
	if (fromKeychain) return fromKeychain;
	return readSecretsFile(agentDir)[service]?.[account];
}

/** Write a secret: OS keychain when available, else the 0600 file fallback. */
export async function writeSecret(agentDir: string, service: string, account: string, secret: string): Promise<void> {
	const stored = await keychainSet(service, account, secret);
	if (stored) return;
	const data = readSecretsFile(agentDir);
	data[service] ??= {};
	data[service]![account] = secret;
	writeSecretsFile(agentDir, data);
}

/** Delete a secret from both the keychain and the file fallback. */
export async function deleteSecret(agentDir: string, service: string, account: string): Promise<void> {
	await keychainDelete(service, account);
	const data = readSecretsFile(agentDir);
	if (data[service]) {
		delete data[service]![account];
		if (Object.keys(data[service]!).length === 0) delete data[service];
		writeSecretsFile(agentDir, data);
	}
}

/** True when a keychain backend is actually available on this host. */
export async function hasKeychain(_agentDir: string, service: string, account: string): Promise<boolean> {
	const probe = `__porcupine_keychain_probe_${randomUUID().slice(0, 6)}`;
	const stored = await keychainSet(service, account, probe);
	if (!stored) return false;
	const readBack = await keychainGet(service, account);
	await keychainDelete(service, account);
	return readBack === probe;
}

/** Whether the secrets file exists (for status display). */
export function hasSecretsFile(agentDir: string): boolean {
	return existsSync(secretsPath(agentDir));
}
