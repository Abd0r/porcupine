/**
 * Autonomous capability learning adapters.
 * On missing/failed capability observations, draft a skill stub under
 * ~/.porcupine/agent/skills/<stack>/learned-<slug>/SKILL.md and activate it.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	type CapabilityImprovementProposal,
	type CapabilityLearningAdapters,
	CapabilityLearningLoop,
	type LearningObservation,
	type ProposalValidation,
} from "@porcupineai/agent-core";
import { isKnownStackId } from "./stacks.ts";

function slugify(input: string): string {
	return (
		input
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 48) || "capability"
	);
}

/** Guess stack for a learning observation from ids/description text. */
export function inferLearningStack(observation: LearningObservation): string {
	const hay =
		`${observation.capabilityId ?? ""} ${observation.description} ${observation.evidence.join(" ")}`.toLowerCase();
	const ordered: Array<[string, RegExp]> = [
		["web", /\b(web|search|http|url|fetch|browser|internet|docs online)\b/],
		["vcs", /\b(git|github|pr|pull request|commit|branch|merge|diff)\b/],
		["build", /\b(build|test|lint|typecheck|ci|vitest|jest|pytest|tsc|compile)\b/],
		["debug", /\b(debug|bug|error|stack trace|fail|crash|repro)\b/],
		["filesystem", /\b(file|read|write|edit|path|fs)\b/],
		["shell", /\b(bash|shell|terminal|command|cli)\b/],
		["sci", /\b(research|paper|literature|citation|doi|experiment|study|benchmark|reproducible)\b/],
		["data", /\b(json|csv|yaml|parse|table)\b/],
		["ml", /\b(model|train|eval|dataset|gpu|paper)\b/],
		["docs", /\b(readme|markdown|docs|changelog)\b/],
		["meta", /\b(skill|stack|memory|session|config|agent)\b/],
	];
	for (const [stack, re] of ordered) {
		if (re.test(hay)) return stack;
	}
	// path-like capability id: stacks/web/...
	const m = hay.match(/\bstacks\/([a-z0-9-]+)\b/);
	if (m && isKnownStackId(m[1])) return m[1]!;
	return "meta";
}

function skillDir(agentDir: string, stack: string, name: string): string {
	return join(agentDir, "skills", stack, name);
}

function skillPath(agentDir: string, stack: string, name: string): string {
	return join(skillDir(agentDir, stack, name), "SKILL.md");
}

function buildSkillMarkdown(proposal: CapabilityImprovementProposal, stack: string): string {
	const name = proposal.id.replace(/^learned-/, "") || "learned-skill";
	const summary = proposal.summary.replace(/\n/g, " ").slice(0, 120);
	const evidence = proposal.evidence.map((e) => `- ${e}`).join("\n");
	const desc = summary.slice(0, 60);
	const descOut = desc.endsWith(".") ? desc : `${desc}.`;
	return `---
name: ${name}
description: ${descOut}
stack: ${stack}
version: 1.0.0
---

# ${name}

Autonomously drafted by Porcupine capability learning.

## Stack

\`${stack}\` — path: \`skills/${stack}/${proposal.id}/\`

## When to Use

${proposal.summary}

## Evidence

${evidence || "- (none)"}

## Procedure

${proposal.content.trim() || "1. Inspect the failure context.\n2. Use the smallest useful tool set.\n3. Verify the outcome."}

## Pitfalls

- Do not treat this stub as complete — refine after a successful run.
- Prefer built-in tools when they already cover the need.
`;
}

export function createAutonomousCapabilityLearningAdapters(agentDir: string): CapabilityLearningAdapters {
	return {
		async draft({ observation, recommendedAction }) {
			const stack = inferLearningStack(observation);
			const base = slugify(observation.capabilityId || observation.description.split(/[:.]/)[0] || observation.type);
			const id = observation.capabilityId?.startsWith("learned-") ? observation.capabilityId : `learned-${base}`;
			const existingPath = skillPath(agentDir, stack, id);
			const existing = existsSync(existingPath) ? readFileSync(existingPath, "utf8") : "";

			const content =
				recommendedAction === "patch" && existing
					? `${existing.trim()}\n\n## Learning update\n\n${observation.description}\n\n${observation.evidence.map((e) => `- ${e}`).join("\n")}\n`
					: [
							`Goal: cover missing/failed capability for: ${observation.description}`,
							"",
							"Steps:",
							"1. Restate the user goal in one line.",
							"2. Gather local context with read/grep/find as needed.",
							"3. Apply the smallest change or command that unblocks the goal.",
							"4. Verify with a concrete command or file read-back.",
							"",
							`Observation type: ${observation.type}`,
							`Inferred stack: ${stack}`,
						].join("\n");

			const proposal: CapabilityImprovementProposal = {
				id,
				kind: "skill",
				action: recommendedAction,
				summary: observation.description.slice(0, 200),
				content,
				evidence: observation.evidence.slice(),
			};
			// activate() needs the stack it wrote under for re-activation; the core
			// proposal type has no field for it, so carry it on a stable extra key.
			(proposal as CapabilityImprovementProposal & { stack?: string }).stack = stack;
			return proposal;
		},

		async validate(proposal): Promise<ProposalValidation> {
			const checks: string[] = [];
			const errors: string[] = [];

			checks.push("has-id");
			if (!proposal.id || !/^[a-z0-9][a-z0-9-]*$/i.test(proposal.id)) {
				errors.push("invalid proposal id");
			}

			checks.push("has-evidence");
			if (!proposal.evidence.length) errors.push("missing evidence");

			checks.push("has-content");
			if (!proposal.content.trim()) errors.push("empty content");

			checks.push("kind-skill");
			if (proposal.kind !== "skill") errors.push("only skill kind is auto-activated");

			checks.push("path-safe");
			if (proposal.id.includes("..") || proposal.id.includes("/")) {
				errors.push("unsafe id path");
			}

			return { valid: errors.length === 0, checks, errors };
		},

		async activate(proposal) {
			const stacked = proposal as CapabilityImprovementProposal & { stack?: string };
			const stack =
				(stacked.stack && isKnownStackId(stacked.stack) && stacked.stack) ||
				inferLearningStack({
					type: "missing-capability",
					description: proposal.summary,
					evidence: proposal.evidence,
					capabilityId: proposal.id,
				});
			const dir = skillDir(agentDir, stack, proposal.id);
			mkdirSync(dir, { recursive: true });
			const path = skillPath(agentDir, stack, proposal.id);
			// A create action must never clobber an existing skill (learned earlier
			// or user-authored); learning-store's applyLearningProposal has the same
			// invariant. Patch actions preserve and extend the existing document.
			if (proposal.action === "create" && existsSync(path)) {
				throw new Error(`Refusing to overwrite existing skill: ${path}`);
			}
			// A patch draft already carries the full existing SKILL.md (frontmatter
			// included) with a learning-update section appended. Writing it as-is
			// preserves the document; re-wrapping it inside buildSkillMarkdown would
			// nest the old frontmatter under the new document's Procedure section.
			const md = proposal.content.trimStart().startsWith("---")
				? proposal.content
				: buildSkillMarkdown(proposal, stack);
			writeFileSync(path, md, { encoding: "utf8", mode: 0o600 });
		},
	};
}

export function createAutonomousCapabilityLearner(agentDir: string): CapabilityLearningLoop {
	return new CapabilityLearningLoop(createAutonomousCapabilityLearningAdapters(agentDir));
}

export type { LearningObservation };
