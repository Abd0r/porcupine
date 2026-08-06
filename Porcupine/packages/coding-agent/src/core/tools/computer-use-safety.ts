/**
 * Shared safety guards for native computer-use input.
 * These are intentional hard blocks, not a complete security boundary.
 */

const BLOCKED_TYPE_PATTERNS: RegExp[] = [
	/\bcurl\b[\s\S]{0,80}\|\s*(?:ba)?sh\b/i,
	/\bwget\b[\s\S]{0,80}\|\s*(?:ba)?sh\b/i,
	/\bsudo\s+rm\s+-rf\s+\/(?:\s|$)/i,
	/:\(\)\s*\{\s*:\|:&\s*\};\s*:/,
	/\brm\s+-rf\s+\/(?:\s|$)/i,
	/\bmkfs\.\w+/i,
	/\bdd\s+if=\/dev\/zero\b/i,
];

const BLOCKED_KEY_COMBOS = new Set([
	"command+q",
	"command+shift+q",
	"control+alt+delete",
	"control+alt+backspace",
	"alt+f4",
	"super+l",
	"command+option+escape",
]);

export function assertSafeComputerUseText(text: string | undefined): void {
	if (!text) return;
	for (const pattern of BLOCKED_TYPE_PATTERNS) {
		if (pattern.test(text)) {
			throw new Error("Blocked potentially destructive typed payload.");
		}
	}
}

export function assertSafeComputerUseKey(key: string | undefined, modifiers: string[] = []): void {
	if (!key) return;
	const combo = [...modifiers.map((item) => item.toLowerCase()), key.toLowerCase()].join("+");
	if (BLOCKED_KEY_COMBOS.has(combo)) {
		throw new Error(`Blocked dangerous key combination: ${combo}.`);
	}
}
