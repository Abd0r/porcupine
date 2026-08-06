import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLiteratureToolDefinition } from "../src/core/tools/literature.ts";
import { LiteratureStore, normalizeDoi } from "../src/porcupine/literature-store.ts";

describe("literature store", () => {
	const cleanups: Array<() => void> = [];
	afterEach(() => {
		while (cleanups.length > 0) cleanups.pop()?.();
	});

	function tempAgentDir(): string {
		const dir = mkdtempSync(join(tmpdir(), "porcupine-literature-"));
		cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
		return dir;
	}

	it("normalizes and validates DOI forms", () => {
		expect(normalizeDoi("https://doi.org/10.1234/abc.2024.1")).toBe("10.1234/abc.2024.1");
		expect(normalizeDoi("doi: 10.1234/xy")).toBe("10.1234/xy");
		expect(normalizeDoi("10.5678/xyz-1")).toBe("10.5678/xyz-1");
		expect(normalizeDoi("not-a-doi")).toBeUndefined();
	});

	it("adds, deduplicates by DOI, lists, and removes references", () => {
		const store = new LiteratureStore(tempAgentDir());
		const added = store.add({
			title: "Reproducible Neural Scaling",
			authors: ["Ada Lovelace", "Alan Turing"],
			year: 2026,
			venue: "ICLR",
			doi: "https://doi.org/10.9999/scaling.1",
			status: "reviewed",
			grade: "A",
			notes: "Scaling laws hold at 1e21 FLOPs.",
		});
		expect(added.ok).toBe(true);
		if (!added.ok) return;
		expect(added.reference.id).toBe("reproducible-neural-scaling");

		const dup = store.add({ title: "Same paper again", doi: "10.9999/scaling.1" });
		expect(dup.ok).toBe(false);
		if (dup.ok) return;
		expect(dup.error).toContain("already recorded");

		expect(store.list()).toHaveLength(1);
		expect(store.get("reproducible-neural-scaling")?.grade).toBe("A");

		expect(store.remove("reproducible-neural-scaling").ok).toBe(true);
		expect(store.list()).toHaveLength(0);
	});

	it("refuses secret-looking content", () => {
		const store = new LiteratureStore(tempAgentDir());
		const result = store.add({ title: "Leaky notes", notes: "the api_key was sk-1234" });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toContain("secret");
	});

	it("writes atomically with a 0600 file", () => {
		const dir = tempAgentDir();
		const store = new LiteratureStore(dir);
		store.add({ title: "Atomic write", doi: "10.1111/atomic.1" });
		const path = join(dir, "literature", "literature.json");
		expect(existsSync(path)).toBe(true);
		expect(readFileSync(path, "utf8")).toContain("Atomic write");
	});
});

describe("literature tool", () => {
	const cleanups: Array<() => void> = [];
	afterEach(() => {
		while (cleanups.length > 0) cleanups.pop()?.();
	});

	function tool() {
		const agentDir = mkdtempSync(join(tmpdir(), "porcupine-literature-tool-"));
		cleanups.push(() => rmSync(agentDir, { recursive: true, force: true }));
		const store = new LiteratureStore(agentDir);
		return { definition: createLiteratureToolDefinition({ agentDir, store }), store };
	}

	function searchText(result: { content: Array<{ type: string; text?: string }> }): string {
		return result.content.map((c) => (c.type === "text" && c.text ? c.text : "")).join("");
	}

	it("adds, searches, shows, updates, and removes through the tool", async () => {
		const { definition, store } = tool();
		const execute = (input: Record<string, unknown>) =>
			definition.execute("call", input as never, undefined, undefined, undefined as never);

		const added = await execute({
			action: "add",
			title: "Attention Is All You Need",
			authors: ["Vaswani"],
			year: 2017,
			venue: "NeurIPS",
			doi: "10.5555/attention.1",
			notes: "Transformer origin.",
		});
		expect(added.details).toMatchObject({ action: "add", added: true });
		const id = added.details?.referenceId as string;
		expect(store.get(id)?.year).toBe(2017);

		const search = await execute({ action: "search", query: "transformer" });
		expect(searchText(search)).toContain(id);

		const listed = await execute({ action: "list" });
		expect(searchText(listed)).toContain("to-read");

		const updated = await execute({ action: "update", referenceId: id, status: "reviewed", grade: "B" });
		expect(searchText(updated)).toContain("reviewed");
		expect(store.get(id)?.status).toBe("reviewed");

		const shown = await execute({ action: "show", referenceId: id });
		expect(searchText(shown)).toContain("Attention Is All You Need");

		const removed = await execute({ action: "remove", referenceId: id });
		expect(removed.details).toMatchObject({ removed: true });
		expect(store.list()).toHaveLength(0);
	});

	it("surfaces store errors through the tool result", async () => {
		const { definition } = tool();
		const result = await definition.execute(
			"call",
			{
				action: "add",
				title: "sk-1234 api_key leak",
			} as never,
			undefined,
			undefined,
			undefined as never,
		);
		expect(searchText(result)).toContain("secret");
	});

	it("rejects missing ids and unknown actions gracefully", async () => {
		const { definition } = tool();
		const missing = await definition.execute(
			"call",
			{ action: "show" } as never,
			undefined,
			undefined,
			undefined as never,
		);
		expect(searchText(missing)).toContain("referenceId");

		const notFound = await definition.execute(
			"call",
			{ action: "show", referenceId: "nope" } as never,
			undefined,
			undefined,
			undefined as never,
		);
		expect(searchText(notFound)).toContain("not found");
	});
});
