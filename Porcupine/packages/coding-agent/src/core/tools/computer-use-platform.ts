/** Platform capability descriptions for native computer use. */

export type ComputerUsePlatform = "darwin" | "linux" | "win32" | "unsupported";

export interface ComputerUseBackendStatus {
	platform: ComputerUsePlatform;
	backend: string;
	available: boolean;
	capabilities: readonly string[];
	requirements: readonly string[];
}

export function normalizeComputerUsePlatform(value: string): ComputerUsePlatform {
	if (value === "darwin" || value === "linux" || value === "win32") return value;
	return "unsupported";
}

/**
 * Return conservative capabilities without probing or executing host commands.
 * Runtime adapters must still verify permissions and command availability before use.
 */
export function describeComputerUseBackend(platformName: string): ComputerUseBackendStatus {
	const current = normalizeComputerUsePlatform(platformName);
	if (current === "darwin") {
		return {
			platform: current,
			backend: "macOS native",
			available: true,
			capabilities: ["status", "observe", "screenshot", "click", "type", "key", "scroll"],
			requirements: ["Screen Recording permission", "Accessibility permission"],
		};
	}
	if (current === "linux") {
		return {
			platform: current,
			backend: "Linux desktop adapter",
			available: false,
			capabilities: ["status", "observe", "screenshot", "click", "type", "key", "scroll"],
			requirements: [
				"supported graphical session",
				"screenshot provider",
				"input provider",
				"DISPLAY or WAYLAND_DISPLAY",
			],
		};
	}
	if (current === "win32") {
		return {
			platform: current,
			backend: "Windows native adapter",
			available: false,
			capabilities: ["status", "observe", "screenshot", "click", "type", "key", "scroll"],
			requirements: ["Windows PowerShell", "interactive desktop session", "screen-capture and input permissions"],
		};
	}
	return {
		platform: current,
		backend: "unsupported",
		available: false,
		capabilities: ["status"],
		requirements: [],
	};
}
