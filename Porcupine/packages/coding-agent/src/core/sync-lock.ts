/**
 * Synchronous directory-lock helper with retry.
 *
 * `proper-lockfile`'s `lockSync` rejects `retries > 0` (code `ESYNC`) because the
 * retry loop in its async API relies on `setTimeout`. Stores that must serialize
 * read-modify-write under a lock but cannot switch their callers to async (X drafts,
 * task scheduler, learning store) instead retry here with a short synchronous
 * busy-wait, so a genuinely-concurrent writer waits briefly rather than throwing
 * `ELOCKED` instantly and dropping the write.
 */

import lockfile from "proper-lockfile";

const MAX_ATTEMPTS = 10;
const DELAY_MS = 100;

function sleepSync(ms: number): void {
	const start = Date.now();
	while (Date.now() - start < ms) {
		// Busy-wait: `lockSync` cannot use proper-lockfile's async retry timers.
	}
}

/**
 * Acquire a synchronous lock on `target`, retrying on `ELOCKED` (held by a
 * concurrent writer) up to `MAX_ATTEMPTS` before giving up. Returns a release
 * function. Throws the last lock error if the lock stays contended.
 */
export function lockDirSync(target: string, options: object): () => void {
	let lastError: unknown;
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		try {
			return lockfile.lockSync(target, options);
		} catch (error) {
			const code =
				typeof error === "object" && error !== null && "code" in error
					? String((error as { code?: unknown }).code)
					: undefined;
			if (code !== "ELOCKED" || attempt === MAX_ATTEMPTS) {
				throw error;
			}
			lastError = error;
			sleepSync(DELAY_MS);
		}
	}
	void lastError;
	throw new Error("Failed to acquire lock: concurrent writer did not yield");
}
