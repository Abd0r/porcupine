import type {
	CapabilityDescriptor,
	CapabilityMatch,
	CapabilitySearchOptions,
	CapabilityTreeProjection,
} from "./types.ts";

function tokenize(value: string): string[] {
	return [
		...new Set(
			value
				.toLowerCase()
				.split(/[^a-z0-9]+/)
				.filter(Boolean),
		),
	];
}

function includesPhrase(query: string, value: string): boolean {
	const normalizedQuery = query.toLowerCase().replace(/[^a-z0-9]+/g, "-");
	const normalizedValue = value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
	return normalizedQuery === normalizedValue || normalizedQuery.startsWith(`${normalizedValue}-`);
}

export class CapabilityTree {
	private readonly capabilities = new Map<string, CapabilityDescriptor>();

	constructor(capabilities: CapabilityDescriptor[] = []) {
		for (const capability of capabilities) {
			this.register(capability);
		}
	}

	register(capability: CapabilityDescriptor): void {
		if (this.capabilities.has(capability.id)) {
			throw new Error(`Capability already registered: ${capability.id}`);
		}
		this.capabilities.set(capability.id, {
			...capability,
			path: capability.path.slice(),
			tags: capability.tags.slice(),
		});
	}

	get(id: string): CapabilityDescriptor | undefined {
		const capability = this.capabilities.get(id);
		return capability
			? {
					...capability,
					path: capability.path.slice(),
					tags: capability.tags.slice(),
				}
			: undefined;
	}

	list(options: { includeUnavailable?: boolean } = {}): CapabilityDescriptor[] {
		return [...this.capabilities.values()]
			.filter((capability) => options.includeUnavailable || capability.available)
			.sort((left, right) => left.id.localeCompare(right.id))
			.map((capability) => ({
				...capability,
				path: capability.path.slice(),
				tags: capability.tags.slice(),
			}));
	}

	get size(): number {
		return this.capabilities.size;
	}

	search(query: string, options: CapabilitySearchOptions = {}): CapabilityMatch[] {
		const queryTerms = tokenize(query);
		if (queryTerms.length === 0) return [];

		const allowedKinds = options.kinds ? new Set(options.kinds) : undefined;
		const matches: CapabilityMatch[] = [];

		for (const capability of this.capabilities.values()) {
			if (!options.includeUnavailable && !capability.available) continue;
			if (allowedKinds && !allowedKinds.has(capability.kind)) continue;

			const reasons: string[] = [];
			let score = 0;
			if (includesPhrase(query, capability.id)) {
				reasons.push("exact-id");
				score += 100;
			}

			const idTerms = new Set(tokenize(capability.id));
			const descriptionTerms = new Set(tokenize(capability.description));
			const tags = new Set(capability.tags.flatMap(tokenize));
			const paths = new Set(capability.path.flatMap(tokenize));

			for (const term of queryTerms) {
				if (tags.has(term)) {
					reasons.push(`tag:${term}`);
					score += 10;
				}
				if (paths.has(term)) {
					reasons.push(`path:${term}`);
					score += 8;
				}
				if (idTerms.has(term)) score += 6;
				if (descriptionTerms.has(term)) score += 3;
			}

			if (score > 0) {
				matches.push({ capability, score, reasons: [...new Set(reasons)] });
			}
		}

		return matches
			.sort((left, right) => right.score - left.score || left.capability.id.localeCompare(right.capability.id))
			.slice(0, options.limit ?? matches.length);
	}

	project(): CapabilityTreeProjection {
		const root: CapabilityTreeProjection = {};
		const sorted = [...this.capabilities.values()].sort((left, right) => left.id.localeCompare(right.id));

		for (const capability of sorted) {
			let node = root;
			for (const segment of capability.path) {
				node.children ??= {};
				node.children[segment] ??= {};
				node = node.children[segment];
			}
			node.capabilities ??= [];
			node.capabilities.push(capability.id);
		}

		return root;
	}
}
