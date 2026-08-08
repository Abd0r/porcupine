/**
 * Durable local literature store: papers and references the agent records
 * during research. Lives at <agentDir>/literature/literature.json.
 *
 * Discipline mirrors the task store: atomic writes under a directory lock so
 * two Porcupine processes cannot clobber each other's updates, and a sensitive
 * guard that refuses to persist secrets in notes or evidence.
 */

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { lockDirSync } from "../core/sync-lock.ts";

export type LiteratureStatus = "to-read" | "reading" | "reviewed" | "incorporated";
export type LiteratureGrade = "A" | "B" | "C" | "D";

export interface LiteratureReference {
	id: string;
	title: string;
	authors: string[];
	year?: number;
	venue?: string;
	url?: string;
	doi?: string;
	status: LiteratureStatus;
	grade?: LiteratureGrade;
	notes?: string;
	evidence?: string;
	createdAt: string;
	updatedAt: string;
}

export interface LiteratureStoreData {
	version: 1;
	references: LiteratureReference[];
}

const SENSITIVE_PATTERN = /\b(password|api[_-]?key|token|secret|ssn|credit\s*card)\b/i;
const DOI_PATTERN = /^10\.\d{4,9}\/[^\s]+$/;

function storePath(agentDir: string): string {
	return join(agentDir, "literature", "literature.json");
}

function readStore(agentDir: string): LiteratureStoreData {
	try {
		const raw = JSON.parse(readFileSync(storePath(agentDir), "utf8")) as LiteratureStoreData;
		if (!Array.isArray(raw.references)) throw new Error("invalid store shape");
		return { version: 1, references: raw.references };
	} catch {
		return { version: 1, references: [] };
	}
}

function atomicWrite(path: string, content: string): void {
	mkdirSync(dirname(path), { recursive: true });
	const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
	try {
		writeFileSync(temporary, content, { encoding: "utf8", mode: 0o600 });
		renameSync(temporary, path);
	} finally {
		try {
			rmSync(temporary, { force: true });
		} catch {
			// Best-effort cleanup; the atomic rename already completed.
		}
	}
}

/** Normalize "https://doi.org/10.x/y", "doi: 10.x/y" to "10.x/y"; validates shape. */
export function normalizeDoi(raw?: string): string | undefined {
	if (!raw) return undefined;
	const candidate = raw
		.trim()
		.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
		.replace(/^doi\s*:\s*/i, "")
		.trim();
	return DOI_PATTERN.test(candidate) ? candidate : undefined;
}

function slugifyTitle(title: string): string {
	return title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);
}

export function hasSensitiveContent(text: string | undefined): boolean {
	return Boolean(text && SENSITIVE_PATTERN.test(text));
}

export class LiteratureStore {
	readonly agentDir: string;
	private data: LiteratureStoreData;

	constructor(agentDir: string) {
		this.agentDir = agentDir;
		this.data = readStore(agentDir);
	}

	private save(): void {
		atomicWrite(storePath(this.agentDir), `${JSON.stringify(this.data, null, 2)}\n`);
	}

	private mutate<T>(operation: () => T): T {
		const filePath = storePath(this.agentDir);
		const directory = dirname(filePath);
		mkdirSync(directory, { recursive: true });
		const release = lockDirSync(directory, {
			lockfilePath: join(directory, ".literature.lock"),
			realpath: false,
			stale: 30_000,
		});
		try {
			this.data = readStore(this.agentDir);
			const result = operation();
			this.save();
			return result;
		} finally {
			release();
		}
	}

	list(): LiteratureReference[] {
		this.data = readStore(this.agentDir);
		return [...this.data.references].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
	}

	get(id: string): LiteratureReference | undefined {
		this.data = readStore(this.agentDir);
		return this.data.references.find((entry) => entry.id === id);
	}

	search(query: string): LiteratureReference[] {
		const needle = query.toLowerCase();
		return this.list().filter((entry) =>
			[entry.title, entry.venue, entry.doi, entry.notes, entry.evidence, ...entry.authors]
				.filter(Boolean)
				.some((field) => field!.toLowerCase().includes(needle)),
		);
	}

	findByDoi(doi: string): LiteratureReference | undefined {
		this.data = readStore(this.agentDir);
		return this.data.references.find((entry) => entry.doi?.toLowerCase() === doi.toLowerCase());
	}

	add(input: {
		title: string;
		authors?: string[];
		year?: number;
		venue?: string;
		url?: string;
		doi?: string;
		status?: LiteratureStatus;
		grade?: LiteratureGrade;
		notes?: string;
		evidence?: string;
	}): { ok: true; reference: LiteratureReference } | { ok: false; error: string } {
		const title = input.title.trim();
		if (!title) return { ok: false, error: "title is required" };
		const doi = normalizeDoi(input.doi);
		const payload = `${title}\n${input.notes ?? ""}\n${input.evidence ?? ""}`;
		if (hasSensitiveContent(payload)) {
			return { ok: false, error: "refusing to store content that looks like a secret" };
		}
		return this.mutate(() => {
			if (doi) {
				const existing = this.data.references.find((entry) => entry.doi?.toLowerCase() === doi.toLowerCase());
				if (existing) {
					return {
						ok: false as const,
						error: `already recorded as ${existing.id} (${existing.title})`,
					};
				}
			}
			const base = slugifyTitle(title);
			let id = base;
			let suffix = 2;
			while (this.data.references.some((entry) => entry.id === id)) {
				id = `${base}-${suffix++}`;
			}
			const now = new Date().toISOString();
			const reference: LiteratureReference = {
				id,
				title,
				authors: (input.authors ?? []).map((author) => author.trim()).filter(Boolean),
				year: input.year,
				venue: input.venue?.trim() || undefined,
				url: input.url?.trim() || undefined,
				doi,
				status: input.status ?? "to-read",
				grade: input.grade,
				notes: input.notes?.trim() || undefined,
				evidence: input.evidence?.trim() || undefined,
				createdAt: now,
				updatedAt: now,
			};
			this.data.references.push(reference);
			return { ok: true as const, reference };
		});
	}

	update(
		id: string,
		patch: Partial<
			Pick<
				LiteratureReference,
				"title" | "authors" | "year" | "venue" | "url" | "doi" | "status" | "grade" | "notes" | "evidence"
			>
		>,
	): { ok: true; reference: LiteratureReference } | { ok: false; error: string } {
		const doi = normalizeDoi(patch.doi);
		if (patch.doi !== undefined && doi === undefined) {
			// An explicit-but-invalid DOI must not silently erase a stored one.
			return { ok: false, error: `invalid doi: ${patch.doi}` };
		}
		const payload = `${patch.title ?? ""}\n${patch.notes ?? ""}\n${patch.evidence ?? ""}`;
		if (hasSensitiveContent(payload)) {
			return { ok: false, error: "refusing to store content that looks like a secret" };
		}
		return this.mutate(() => {
			const reference = this.data.references.find((entry) => entry.id === id);
			if (!reference) return { ok: false as const, error: `reference not found: ${id}` };
			if (doi) {
				const clash = this.data.references.find(
					(entry) => entry.id !== id && entry.doi?.toLowerCase() === doi.toLowerCase(),
				);
				if (clash) {
					return { ok: false as const, error: `doi already recorded as ${clash.id} (${clash.title})` };
				}
			}
			if (patch.title !== undefined) reference.title = patch.title.trim() || reference.title;
			if (patch.authors !== undefined) {
				reference.authors = patch.authors.map((author) => author.trim()).filter(Boolean);
			}
			if (patch.year !== undefined) reference.year = patch.year;
			if (patch.venue !== undefined) reference.venue = patch.venue.trim() || undefined;
			if (patch.url !== undefined) reference.url = patch.url.trim() || undefined;
			if (patch.doi !== undefined) reference.doi = doi;
			if (patch.status !== undefined) reference.status = patch.status;
			if (patch.grade !== undefined) reference.grade = patch.grade;
			if (patch.notes !== undefined) reference.notes = patch.notes.trim() || undefined;
			if (patch.evidence !== undefined) reference.evidence = patch.evidence.trim() || undefined;
			reference.updatedAt = new Date().toISOString();
			return { ok: true as const, reference };
		});
	}

	remove(id: string): { ok: true } | { ok: false; error: string } {
		return this.mutate(() => {
			const index = this.data.references.findIndex((entry) => entry.id === id);
			if (index < 0) return { ok: false as const, error: `reference not found: ${id}` };
			this.data.references.splice(index, 1);
			return { ok: true as const };
		});
	}
}
