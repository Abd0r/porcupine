import { execFile as execFileCallback } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { assertSafeComputerUseKey, assertSafeComputerUseText } from "./computer-use-safety.ts";

const execFile = promisify(execFileCallback);
const SCREENSHOT_COMMANDS = ["gnome-screenshot", "scrot", "import", "grim"] as const;

const AT_SPI_SCRIPT = `
import json
import sys
try:
    import pyatspi
except Exception as error:
    print(json.dumps({"ok": False, "error": f"pyatspi unavailable: {error}", "elements": []}))
    raise SystemExit(0)

def walk(node, depth=0, out=None):
    if out is None:
        out = []
    if len(out) >= 80 or depth > 5:
        return out
    try:
        name = node.name or ""
        role = node.getRoleName() if hasattr(node, "getRoleName") else ""
        try:
            x, y = node.getPosition(pyatspi.COMPONENT_LAYER_WINDOW)
            w, h = node.getSize()
        except Exception:
            x = y = w = h = None
        if name or role:
            out.append({"name": name[:120], "role": role, "x": x, "y": y, "w": w, "h": h, "depth": depth})
        for child in node:
            walk(child, depth + 1, out)
            if len(out) >= 80:
                break
    except Exception:
        pass
    return out

try:
    desktop = pyatspi.Registry.getDesktop(0)
    elements = walk(desktop)
    print(json.dumps({"ok": True, "error": None, "elements": elements}))
except Exception as error:
    print(json.dumps({"ok": False, "error": str(error), "elements": []}))
`;

export interface LinuxComputerUseOptions {
	agentDir: string;
}

export interface LinuxComputerUseCapture {
	path: string;
	data: string;
	provider: string;
}

async function commandAvailable(command: string): Promise<boolean> {
	try {
		await execFile("sh", ["-lc", `command -v ${command}`], { timeout: 2_000, maxBuffer: 8 * 1024 });
		return true;
	} catch {
		return false;
	}
}

async function screenshotCommand(): Promise<string | undefined> {
	for (const command of SCREENSHOT_COMMANDS) {
		if (await commandAvailable(command)) return command;
	}
	return undefined;
}

export async function captureLinuxScreenshot(options: LinuxComputerUseOptions): Promise<LinuxComputerUseCapture> {
	if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
		throw new Error("Linux computer use requires DISPLAY or WAYLAND_DISPLAY.");
	}
	const command = await screenshotCommand();
	if (!command)
		throw new Error(
			"No supported Linux screenshot provider found. Install grim, gnome-screenshot, scrot, or ImageMagick.",
		);
	const outputDir = join(options.agentDir, "computer-use");
	mkdirSync(outputDir, { recursive: true });
	const path = join(outputDir, "last-screenshot.png");
	const args =
		command === "gnome-screenshot" ? ["-f", path] : command === "import" ? ["-window", "root", path] : [path];
	await execFile(command, args, { timeout: 15_000, maxBuffer: 64 * 1024 });
	return { path, data: readFileSync(path).toString("base64"), provider: command };
}

export type LinuxInputAction = "click" | "type" | "key" | "scroll";

export interface LinuxInputRequest {
	action: LinuxInputAction;
	x?: number;
	y?: number;
	text?: string;
	key?: string;
	modifiers?: string[];
	amount?: number;
	clicks?: number;
}

const KEY_NAMES: Record<string, string> = {
	enter: "Return",
	escape: "Escape",
	tab: "Tab",
	space: "space",
	up: "Up",
	down: "Down",
	left: "Left",
	right: "Right",
	backspace: "BackSpace",
	delete: "Delete",
	pageup: "Page_Up",
	pagedown: "Page_Down",
	home: "Home",
	end: "End",
};

function linuxModifier(modifier: string): string {
	return modifier === "command" ? "super" : modifier === "option" ? "alt" : modifier;
}

function requireFinite(value: number | undefined, name: string): number {
	if (!Number.isFinite(value)) throw new Error(`${name} must be a finite number.`);
	return Math.round(value as number);
}

export interface LinuxAccessibilityElement {
	name: string;
	role: string;
	x: number | null;
	y: number | null;
	w: number | null;
	h: number | null;
	depth: number;
}

export interface LinuxAccessibilitySnapshot {
	ok: boolean;
	error?: string;
	elements: LinuxAccessibilityElement[];
}

export async function captureLinuxAccessibilityTree(): Promise<LinuxAccessibilitySnapshot> {
	if (!(await commandAvailable("python3"))) {
		return { ok: false, error: "python3 unavailable for AT-SPI snapshot", elements: [] };
	}
	try {
		const { stdout } = await execFile("python3", ["-c", AT_SPI_SCRIPT], {
			timeout: 8_000,
			maxBuffer: 256 * 1024,
			env: process.env,
		});
		const parsed = JSON.parse(stdout.trim()) as LinuxAccessibilitySnapshot;
		return {
			ok: Boolean(parsed.ok),
			error: parsed.error ?? undefined,
			elements: Array.isArray(parsed.elements) ? parsed.elements.slice(0, 80) : [],
		};
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error),
			elements: [],
		};
	}
}

export function formatLinuxAccessibilityTree(snapshot: LinuxAccessibilitySnapshot): string {
	if (!snapshot.ok) {
		return `Accessibility tree: unavailable${snapshot.error ? ` (${snapshot.error})` : ""}. Falling back to screenshot coordinates.`;
	}
	if (!snapshot.elements.length) return "Accessibility tree: empty.";
	const lines = snapshot.elements.slice(0, 40).map((element, index) => {
		const bounds =
			element.x == null || element.y == null
				? "bounds=unknown"
				: `bounds=${element.x},${element.y}${element.w != null && element.h != null ? ` ${element.w}x${element.h}` : ""}`;
		return `${index + 1}. [${element.role || "unknown"}] ${element.name || "(unnamed)"} ${bounds}`;
	});
	return [`Accessibility tree (${snapshot.elements.length} element(s)):`, ...lines].join("\n");
}

async function dispatchWaylandInput(input: LinuxInputRequest): Promise<string> {
	if (input.action === "type") {
		if (!input.text) throw new Error("type requires non-empty text.");
		assertSafeComputerUseText(input.text);
		if (await commandAvailable("wtype")) {
			await execFile("wtype", ["--", input.text], { timeout: 10_000, maxBuffer: 16 * 1024 });
			return `Typed ${input.text.length} characters using wtype.`;
		}
		if (await commandAvailable("ydotool")) {
			await execFile("ydotool", ["type", "--", input.text], { timeout: 10_000, maxBuffer: 16 * 1024 });
			return `Typed ${input.text.length} characters using ydotool.`;
		}
		throw new Error("Wayland text input requires wtype or ydotool.");
	}
	if (input.action === "key") {
		if (!input.key || !KEY_NAMES[input.key]) throw new Error("key requires a supported key name.");
		assertSafeComputerUseKey(input.key, input.modifiers);
		if (await commandAvailable("wtype")) {
			const args: string[] = [];
			for (const modifier of input.modifiers ?? []) args.push("-M", linuxModifier(modifier));
			args.push("-k", KEY_NAMES[input.key]);
			for (const modifier of [...(input.modifiers ?? [])].reverse()) args.push("-m", linuxModifier(modifier));
			await execFile("wtype", args, { timeout: 10_000, maxBuffer: 16 * 1024 });
			return `Pressed ${[...(input.modifiers ?? []), input.key].join("+")} using wtype.`;
		}
		throw new Error("Wayland key input requires wtype.");
	}
	if (!(await commandAvailable("ydotool"))) {
		throw new Error("Wayland click/scroll require ydotool with a working uinput socket.");
	}
	if (input.action === "click") {
		const x = requireFinite(input.x, "x");
		const y = requireFinite(input.y, "y");
		const clicks = input.clicks === 2 ? 2 : 1;
		await execFile("ydotool", ["mousemove", "--absolute", String(x), String(y)], {
			timeout: 10_000,
			maxBuffer: 16 * 1024,
		});
		for (let index = 0; index < clicks; index += 1) {
			await execFile("ydotool", ["click", "0xC0"], { timeout: 10_000, maxBuffer: 16 * 1024 });
		}
		return `Clicked ${clicks === 2 ? "twice" : "once"} at (${x}, ${y}) using ydotool.`;
	}
	const amount = Math.max(-10, Math.min(10, Math.trunc(input.amount ?? 1)));
	if (!amount) throw new Error("scroll amount must not be zero.");
	const wheel = amount > 0 ? -120 : 120;
	for (let index = 0; index < Math.abs(amount); index += 1) {
		await execFile("ydotool", ["mousemove", "--", "0", String(wheel)], { timeout: 10_000, maxBuffer: 16 * 1024 });
	}
	return `Scrolled ${Math.abs(amount)} page(s) ${amount > 0 ? "down" : "up"} using ydotool.`;
}

export async function dispatchLinuxInput(input: LinuxInputRequest): Promise<string> {
	const session = process.env.XDG_SESSION_TYPE ?? "x11";
	if (session === "wayland") return dispatchWaylandInput(input);

	if (!(await commandAvailable("xdotool"))) throw new Error("X11 input requires xdotool.");
	if (input.action === "click") {
		const x = requireFinite(input.x, "x");
		const y = requireFinite(input.y, "y");
		const clicks = input.clicks === 2 ? 2 : 1;
		await execFile(
			"xdotool",
			["mousemove", "--sync", String(x), String(y), "click", "--repeat", String(clicks), "1"],
			{ timeout: 10_000, maxBuffer: 16 * 1024 },
		);
		return `Clicked ${clicks === 2 ? "twice" : "once"} at (${x}, ${y}) using xdotool.`;
	}
	if (input.action === "type") {
		if (!input.text) throw new Error("type requires non-empty text.");
		assertSafeComputerUseText(input.text);
		await execFile("xdotool", ["type", "--clearmodifiers", "--delay", "0", "--", input.text], {
			timeout: 10_000,
			maxBuffer: 16 * 1024,
		});
		return `Typed ${input.text.length} characters using xdotool.`;
	}
	if (input.action === "key") {
		if (!input.key || !KEY_NAMES[input.key]) throw new Error("key requires a supported key name.");
		assertSafeComputerUseKey(input.key, input.modifiers);
		const key = [...(input.modifiers ?? []).map(linuxModifier), KEY_NAMES[input.key]].join("+");
		await execFile("xdotool", ["key", "--clearmodifiers", key], { timeout: 10_000, maxBuffer: 16 * 1024 });
		return `Pressed ${[...(input.modifiers ?? []), input.key].join("+")} using xdotool.`;
	}
	const amount = Math.max(-10, Math.min(10, Math.trunc(input.amount ?? 1)));
	if (!amount) throw new Error("scroll amount must not be zero.");
	await execFile("xdotool", ["click", "--repeat", String(Math.abs(amount)), amount > 0 ? "5" : "4"], {
		timeout: 10_000,
		maxBuffer: 16 * 1024,
	});
	return `Scrolled ${Math.abs(amount)} page(s) ${amount > 0 ? "down" : "up"} using xdotool.`;
}

export async function linuxComputerUseStatus(): Promise<string> {
	const session = process.env.XDG_SESSION_TYPE ?? "unknown";
	const screenshot = await screenshotCommand();
	const input =
		session === "wayland"
			? (await commandAvailable("wtype")) || (await commandAvailable("ydotool"))
			: await commandAvailable("xdotool");
	const accessibility = await captureLinuxAccessibilityTree();
	return [
		`Linux session: ${session}.`,
		`Screenshot provider: ${screenshot ?? "missing"}.`,
		`Input provider: ${input ? "available" : "missing"}.`,
		`AT-SPI: ${accessibility.ok ? `${accessibility.elements.length} element(s)` : (accessibility.error ?? "unavailable")}.`,
	].join(" ");
}
