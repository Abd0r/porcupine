/**
 * Argument parsing for `/extract-stack` and `/craft-stack`.
 *
 * Supports positional args plus `--flag <value>` and boolean `--flag` switches.
 */

export interface StackCommandArgs {
	positionals: string[];
	/** Values for value-flags and "true" for boolean flags that were passed. */
	flags: Record<string, string>;
}

/**
 * Parse a command string into positionals and flags.
 * @param valueRemaining the raw arg string after the command name.
 * @param valueFlags flags that consume a following value.
 * @param booleanFlags flags that are bare switches (no value).
 */
export function parseStackCommandArgs(
	valueRemaining: string,
	valueFlags: string[],
	booleanFlags: string[],
): StackCommandArgs {
	const valueSet = new Set(valueFlags);
	const boolSet = new Set(booleanFlags);
	const tokens = tokenize(valueRemaining);

	const positionals: string[] = [];
	const flags: Record<string, string> = {};

	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i]!;
		if (token.startsWith("--")) {
			const name = token.slice(2);
			if (boolSet.has(name)) {
				flags[name] = "true";
			} else if (valueSet.has(name)) {
				const nextValue = tokens[i + 1];
				if (nextValue === undefined) {
					throw new Error(`Flag --${name} requires a value`);
				}
				flags[name] = nextValue;
				i++; // consumed the value
			} else {
				throw new Error(`Unknown flag --${name}`);
			}
		} else if (token.startsWith("-") && token.length > 1) {
			throw new Error(`Unknown short flag ${token}`);
		} else {
			positionals.push(token);
		}
	}

	return { positionals, flags };
}

/** Split a command string into tokens, honoring double-quoted values. */
function tokenize(input: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let inQuotes = false;
	for (let i = 0; i < input.length; i++) {
		const ch = input[i]!;
		if (ch === '"') {
			inQuotes = !inQuotes;
			continue;
		}
		if (ch === " " && !inQuotes) {
			if (current.length > 0) {
				tokens.push(current);
				current = "";
			}
		} else {
			current += ch;
		}
	}
	if (current.length > 0) tokens.push(current);
	return tokens;
}
