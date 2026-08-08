import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import lockfile from "proper-lockfile";
import { describe, expect, it } from "vitest";
import { XDrafts } from "../src/porcupine/x.ts";

describe("bug-proof-cbE: XDrafts directory-lock now waits before failing (retries)", () => {
	it("a contended add no longer fails instantly; it retries, and only throws once the retry budget is exhausted", async () => {
		const agentDir = mkdtempSync(join(tmpdir(), "porcupine-xdrafts-lock-"));
		// Acquire the same directory lock the drafts store uses, as if another
		// (goroutine/process) writer held it for the full retry window.
		const dir = join(agentDir, "x");
		const fs = await import("node:fs");
		fs.mkdirSync(dir, { recursive: true });
		const release = lockfile.lockSync(dir, {
			lockfilePath: join(dir, ".xdrafts.lock"),
			realpath: false,
			retries: { retries: 0 },
			stale: 30_000,
		});

		const store = new XDrafts(agentDir);
		// The store now retries the lock (via core/sync-lock.ts) instead of throwing
		// instantly on ELOCKED. Because the mock holder stays locked for the whole
		// retry window, the write gives up after the retry budget and throws only
		// then - it never silently succeeds, so no data loss is hidden.
		const started = Date.now();
		let threw: Error | null = null;
		try {
			store.add("hello");
		} catch (e) {
			threw = e as Error;
		}

		release();
		// It must have waited (retried) for the lock rather than failing fast.
		expect(Date.now() - started).toBeGreaterThan(50);
		expect(threw).not.toBeNull();
	});
});
