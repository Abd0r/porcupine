import { type ArtifactChange, describeArtifactChange } from "./artifact-change.ts";
import type { CapabilityKind } from "./types.ts";

export type LearningObservationType = "missing-capability" | "execution-failure" | "verification-failure";
export type CapabilityImprovementAction = "create" | "patch";

export interface LearningObservation {
	type: LearningObservationType;
	description: string;
	evidence: string[];
	capabilityId?: string;
}

export interface CapabilityImprovementProposal {
	id: string;
	kind: CapabilityKind;
	action: CapabilityImprovementAction;
	summary: string;
	content: string;
	evidence: string[];
}

export interface ProposalValidation {
	valid: boolean;
	checks: string[];
	errors: string[];
}

export interface CapabilityLearningAdapters {
	draft(context: {
		observation: LearningObservation;
		recommendedAction: CapabilityImprovementAction;
	}): Promise<CapabilityImprovementProposal>;
	validate(proposal: CapabilityImprovementProposal): Promise<ProposalValidation>;
	activate(proposal: CapabilityImprovementProposal): Promise<void>;
}

export interface CapabilityLearningResult {
	status: "activated" | "rejected";
	proposal?: CapabilityImprovementProposal;
	validation?: ProposalValidation;
	reasons: string[];
}

export class CapabilityLearningLoop {
	private readonly adapters: CapabilityLearningAdapters;

	constructor(adapters: CapabilityLearningAdapters) {
		this.adapters = adapters;
	}

	async learn(observation: LearningObservation): Promise<CapabilityLearningResult> {
		if (observation.evidence.length === 0) {
			return { status: "rejected", reasons: ["Learning observations require evidence."] };
		}

		const recommendedAction: CapabilityImprovementAction = observation.capabilityId ? "patch" : "create";
		const proposal = await this.adapters.draft({ observation, recommendedAction });
		if (proposal.action !== recommendedAction) {
			return {
				status: "rejected",
				proposal,
				reasons: [`Expected ${recommendedAction} proposal, received ${proposal.action}.`],
			};
		}
		if (proposal.evidence.length === 0) {
			return { status: "rejected", proposal, reasons: ["Capability proposals require evidence."] };
		}

		const validation = await this.adapters.validate(proposal);
		if (!validation.valid) {
			return { status: "rejected", proposal, validation, reasons: validation.errors };
		}

		await this.adapters.activate(proposal);
		return { status: "activated", proposal, validation, reasons: [] };
	}
}

export type UserPatternCategory = "preference" | "correction" | "workflow" | "context";

export interface UserPatternProposal {
	key: string;
	category: UserPatternCategory;
	fact: string;
	confidence: number;
	evidence: string[];
	sensitive: boolean;
	temporary: boolean;
}

export interface UserPatternLearningAdapters {
	extract(message: string): Promise<UserPatternProposal[]>;
	readUserFile(path: string): Promise<string>;
	writeUserFile(path: string, content: string): Promise<void>;
}

export interface UserPatternLearningResult {
	status: "updated" | "unchanged";
	accepted: UserPatternProposal[];
	rejected: UserPatternProposal[];
	fileChange?: ArtifactChange;
}

export interface UserPatternLearningOptions {
	userFile?: string;
	minimumConfidence?: number;
}

function patternPrefix(pattern: Pick<UserPatternProposal, "category" | "key">): string {
	return `- [${pattern.category}:${pattern.key}]`;
}

function upsertPattern(content: string, pattern: UserPatternProposal): string {
	const prefix = patternPrefix(pattern);
	const line = `${prefix} ${pattern.fact}`;
	const normalized = content.replace(/\r\n/g, "\n").replace(/\n+$/, "");
	const lines = normalized.length > 0 ? normalized.split("\n") : [];
	const existingIndex = lines.findIndex((candidate) => candidate.startsWith(`${prefix} `));
	if (existingIndex >= 0) {
		lines[existingIndex] = line;
	} else {
		if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
		lines.push(line);
	}
	return `${lines.join("\n")}\n`;
}

export class UserPatternLearningLoop {
	private readonly adapters: UserPatternLearningAdapters;
	private readonly userFile: string;
	private readonly minimumConfidence: number;

	constructor(adapters: UserPatternLearningAdapters, options: UserPatternLearningOptions = {}) {
		this.adapters = adapters;
		this.userFile = options.userFile ?? "USER.md";
		this.minimumConfidence = options.minimumConfidence ?? 0.8;
	}

	async learn(message: string): Promise<UserPatternLearningResult> {
		const proposals = await this.adapters.extract(message);
		const accepted = proposals.filter(
			(proposal) =>
				!proposal.sensitive &&
				!proposal.temporary &&
				proposal.confidence >= this.minimumConfidence &&
				proposal.evidence.length > 0 &&
				proposal.fact.trim().length > 0,
		);
		const rejected = proposals.filter((proposal) => !accepted.includes(proposal));
		if (accepted.length === 0) return { status: "unchanged", accepted, rejected };

		const previousContent = await this.adapters.readUserFile(this.userFile);
		let content = previousContent;
		let changed = false;
		for (const pattern of accepted) {
			const next = upsertPattern(content, pattern);
			if (next !== content) changed = true;
			content = next;
		}
		if (!changed) return { status: "unchanged", accepted, rejected };

		await this.adapters.writeUserFile(this.userFile, content);
		return {
			status: "updated",
			accepted,
			rejected,
			fileChange: describeArtifactChange(
				this.userFile,
				previousContent,
				content,
				`Learned ${accepted.length} user ${accepted.length === 1 ? "pattern" : "patterns"}.`,
			),
		};
	}
}
