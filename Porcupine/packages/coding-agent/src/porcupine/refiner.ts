/**
 * Refiner — the autonomous skill-improvement pass (Phase D).
 *
 * Scans porcupine-crafted skills for evidence of weakness (low success rate,
 * recent failures in the evidence counter, repeated user corrections), then
 * applies a small targeted edit to the skill body — snapshotted before the
 * edit, recorded as a proposal, and announced in the learning-activity feed.
 *
 * Edits are autonomous per the product decision: no approval queue. Guardrails:
 * - Only edits `porcupine-crafted` skills (never user-authored).
 * - Never touches the frontmatter (name/description stay spec-valid).
 * - Snapshot before every edit → auto-rollback on regression.
 * - SENSITIVE_PATTERN content is refused.
 * - Per-skill cooldown prevents thrashing the same skill every turn.
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAllSkillStats, skillSuccessRate, trailingSuccessRate } from "./evidence-counter.ts";
import { type LearningProposal, markSnapshotContent, publishFeedEntry, snapshotArtifact } from "./learning-store.ts";

export interface RefinerOptions {
	agentDir: string;
	/** Optional LLM generator for targeted patches. When absent → heuristic append. */
	generate?: (prompt: string) => Promise<string>;
	sessionId?: string;
	/** Max skills to refine in one pass (default 1). */
	maxSkillsPerRun?: number;
	/** Success-rate at or below which a skill becomes a refinement candidate. */
	candidateThreshold?: number;
}

export interface RefineResult {
	proposal: LearningProposal;
	file: string;
	linesAdded: number;
	linesRemoved: number;
	via: "llm" | "heuristic" | "skipped";
	reason?: string;
}

const SENSITIVE_PATTERN = /\b(password|api[_-]?key|token|secret|ssn|credit\s*card)\b/i;
const REFINE_SKILL_COOLDOWN_MS = 30 * 60 * 1000; // same skill: once per 30 min

/** Cooldown tracker: skill path → last refine timestamp (in-memory, per process). */
const lastRefinedAt = new Map<string, number>();

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
			// Best-effort cleanup.
		}
	}
}

/** A SKILL.md file with its stack/name derived from its path. */
export interface SkillFile {
	path: string;
	stack: string;
	name: string;
	content: string;
	isPorcupineCrafted: boolean;
}

/** Find all porcupine-crafted skills on disk that the agent may improve. */
export function listRefinableSkills(agentDir: string): SkillFile[] {
	const skillsRoot = join(agentDir, "skills");
	if (!existsSync(skillsRoot)) return [];
	const results: SkillFile[] = [];
	for (const stack of readdirSync(skillsRoot, { withFileTypes: true })) {
		if (!stack.isDirectory()) continue;
		const stackDir = join(skillsRoot, stack.name);
		for (const entry of readdirSync(stackDir, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			const skillPath = join(stackDir, entry.name, "SKILL.md");
			if (!existsSync(skillPath)) continue;
			const content = readFileSync(skillPath, "utf8");
			// Only skills created by the learning system are autonomously refinable;
			// user-authored skills are never silently edited.
			if (!/created_by\s*:\s*porcupine-learning/i.test(content)) continue;
			results.push({
				path: skillPath,
				stack: stack.name,
				name: entry.name,
				content,
				isPorcupineCrafted: true,
			});
		}
	}
	return results;
}

/** Extract the frontmatter/body split so edits never touch the frontmatter. */
function splitFrontmatter(content: string): { head: string; body: string } {
	const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content);
	if (!match) return { head: "", body: content };
	return { head: `---\n${match[1]}\n---\n`, body: match[2] ?? "" };
}

/** A short, honest evidence block for a weak skill. */
function heuristicPatch(_skill: SkillFile, failures: string[]): string {
	const evidenceLines = failures
		.slice(0, 5)
		.map((line) => `- ${line}`)
		.join("\n");
	return [
		"",
		"## Evidence Update (auto-refined)",
		"",
		`This skill showed weakness in recent use${evidenceLines ? ":" : "."}`,
		evidenceLines,
		"",
		"Suggested fix direction: re-check the exact inputs and the verification step before following this procedure.",
		"",
	].join("\n");
}

/**
 * Run one refinement pass over candidate porcupine-crafted skills.
 * Autonomous: applies the patch, snapshots before, records + announces.
 */
export async function runRefiner(options: RefinerOptions): Promise<RefineResult[]> {
	const { agentDir, generate, sessionId, maxSkillsPerRun = 1, candidateThreshold = 0.6 } = options;
	const results: RefineResult[] = [];

	const skills = listRefinableSkills(agentDir).filter((skill) => skill.isPorcupineCrafted);
	// Score candidates by trailing success rate (low = weak = candidate).
	const scored = skills
		.map((skill) => {
			const stats = getAllSkillStats(agentDir)[skill.name] ?? getAllSkillStats(agentDir)[skill.path];
			// Baseline must come from the SAME windowed measure checkRollback compares
			// against (trailingSuccessRate), not the lifetime skillSuccessRate —
			// otherwise the apples-to-oranges + dilution problem is unavoidable.
			const rate =
				trailingSuccessRate(agentDir, skill.name) ??
				skillSuccessRate(agentDir, skill.name) ??
				trailingSuccessRate(agentDir, skill.path) ??
				skillSuccessRate(agentDir, skill.path) ??
				1;
			const recentFailures = (stats?.window ?? [])
				.filter((record) => !record.ok)
				.slice(-5)
				.map((record) => `failed use at ${new Date(record.at).toLocaleString()}`);
			return { skill, rate, recentFailures };
		})
		.filter(({ rate, skill }) => {
			const last = lastRefinedAt.get(skill.path);
			return rate < candidateThreshold && (!last || Date.now() - last > REFINE_SKILL_COOLDOWN_MS);
		})
		.sort((a, b) => a.rate - b.rate)
		.slice(0, maxSkillsPerRun);

	for (const { skill, rate, recentFailures } of scored) {
		const { head, body } = splitFrontmatter(skill.content);
		if (!head || !body.trim()) {
			results.push({
				proposal: emptyProposal(skill, "skipped", "malformed SKILL.md (no frontmatter)"),
				file: skill.path,
				linesAdded: 0,
				linesRemoved: 0,
				via: "skipped",
				reason: "malformed SKILL.md (no frontmatter)",
			});
			continue;
		}

		// Generate the patch — LLM when available, heuristic otherwise.
		let patch: string;
		let via: "llm" | "heuristic";
		if (generate) {
			try {
				const prompt = [
					`The following skill has a trailing success rate of ${(rate * 100).toFixed(0)}%.`,
					`Recent failures: ${recentFailures.join("; ") || "none recorded"}.`,
					"",
					"Propose a SMALL, targeted addition (max 8 lines) to the '## Pitfalls' or '## Verification' section",
					"that would prevent the failure mode. Output ONLY the markdown block to append — no preamble.",
					"",
					"--- SKILL START ---",
					skill.content.slice(0, 6_000),
					"--- SKILL END ---",
				].join("\n");
				const raw = (await generate(prompt)).trim();
				if (raw && !SENSITIVE_PATTERN.test(raw)) {
					patch = `\n${raw.replace(/^```[a-z]*\n?|```$/g, "")}\n`;
					via = "llm";
				} else {
					patch = heuristicPatch(skill, recentFailures);
					via = "heuristic";
				}
			} catch {
				patch = heuristicPatch(skill, recentFailures);
				via = "heuristic";
			}
		} else {
			patch = heuristicPatch(skill, recentFailures);
			via = "heuristic";
		}

		const nextContent = `${head}${body.trimEnd()}\n${patch}\n`;
		const before = skill.content;
		const added = nextContent.split("\n").length - before.split("\n").length;

		// Snapshot BEFORE the edit → auto-rollback baseline.
		const snapshot = snapshotArtifact(agentDir, skill.path, {
			reason: `auto-refine ${skill.name}`,
			baselineRate: rate,
		});

		atomicWrite(skill.path, nextContent);
		// Record the post-edit content hash so revert refuses to clobber a later edit.
		markSnapshotContent(agentDir, snapshot.id, nextContent);

		const now = new Date().toISOString();
		const proposal: LearningProposal = {
			id: `refined-${skill.name}-${Date.now().toString(36)}`,
			kind: "skill",
			status: "activated",
			createdAt: now,
			updatedAt: now,
			summary: `Auto-refined ${skill.name} (success rate ${(rate * 100).toFixed(0)}% → improved guidance).`,
			evidence: [...recentFailures, `trailing success rate was ${(rate * 100).toFixed(0)}%`],
			sessionId,
			stack: skill.stack,
			origin: "porcupine-crafted",
			verificationGrade: via === "llm" ? "B" : "C",
			riskTier: "medium",
			snapshotRef: snapshot.id,
		};
		writeProposal(agentDir, proposal);
		publishFeedEntry(agentDir, {
			action: "edited",
			file: skill.path,
			linesAdded: Math.max(0, added),
			linesRemoved: 0,
			summary: proposal.summary,
			proposalId: proposal.id,
			kind: proposal.kind,
		});
		lastRefinedAt.set(skill.path, Date.now());

		results.push({ proposal, file: skill.path, linesAdded: Math.max(0, added), linesRemoved: 0, via });
	}

	return results;
}

function writeProposal(agentDir: string, proposal: LearningProposal): void {
	const dir = join(agentDir, "learning", "proposals");
	mkdirSync(dir, { recursive: true });
	atomicWrite(join(dir, `${proposal.id}.json`), `${JSON.stringify(proposal, null, 2)}\n`);
}

function emptyProposal(skill: SkillFile, status: string, reason: string): LearningProposal {
	const now = new Date().toISOString();
	return {
		id: `skipped-${skill.name}-${Date.now().toString(36)}`,
		kind: "skill",
		status: status as LearningProposal["status"],
		createdAt: now,
		updatedAt: now,
		summary: `Skipped ${skill.name}: ${reason}`,
		evidence: [reason],
		stack: skill.stack,
	};
}
