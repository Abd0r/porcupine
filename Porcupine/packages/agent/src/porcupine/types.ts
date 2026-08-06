export type CapabilityKind = "tool" | "skill";

export interface CapabilityDescriptor {
	id: string;
	kind: CapabilityKind;
	path: string[];
	description: string;
	tags: string[];
	available: boolean;
}

export interface CapabilityMatch {
	capability: CapabilityDescriptor;
	score: number;
	reasons: string[];
}

export interface CapabilitySearchOptions {
	kinds?: CapabilityKind[];
	includeUnavailable?: boolean;
	limit?: number;
}

export interface CapabilityTreeProjection {
	capabilities?: string[];
	children?: Record<string, CapabilityTreeProjection>;
}
