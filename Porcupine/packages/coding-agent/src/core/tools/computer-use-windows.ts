import { execFile as execFileCallback } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { assertSafeComputerUseKey, assertSafeComputerUseText } from "./computer-use-safety.ts";

const execFile = promisify(execFileCallback);

export interface WindowsComputerUseOptions {
	agentDir: string;
}

export interface WindowsComputerUseCapture {
	path: string;
	data: string;
}

export interface WindowsInputRequest {
	action: "click" | "type" | "key" | "scroll";
	x?: number;
	y?: number;
	text?: string;
	key?: string;
	modifiers?: string[];
	amount?: number;
	clicks?: number;
}

function powershellCommand(): string {
	return process.env.ComSpec ? "powershell.exe" : "pwsh";
}

async function runPowerShell(script: string, args: string[] = []): Promise<void> {
	await execFile(
		powershellCommand(),
		["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script, ...args],
		{ timeout: 15_000, maxBuffer: 64 * 1024, windowsHide: true },
	);
}

const screenshotScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bitmap.Save($args[0], [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
`;

const inputType = `
using System;
using System.Runtime.InteropServices;
public static class PorcupineInput {
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public InputUnion U; }
  [StructLayout(LayoutKind.Explicit)] public struct InputUnion { [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [DllImport("user32.dll", SetLastError=true)] static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern void mouse_event(uint flags, uint dx, uint dy, int data, UIntPtr extra);
  public static void TypeText(string text) {
    foreach (char c in text) {
      var inputs = new INPUT[2];
      inputs[0].type = 1; inputs[0].U.ki.wScan = c; inputs[0].U.ki.dwFlags = 4;
      inputs[1].type = 1; inputs[1].U.ki.wScan = c; inputs[1].U.ki.dwFlags = 4 | 2;
      SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
    }
  }
  public static void Click(int x, int y, int count) {
    SetCursorPos(x, y);
    for (int i = 0; i < count; i++) { mouse_event(2, 0, 0, 0, UIntPtr.Zero); mouse_event(4, 0, 0, 0, UIntPtr.Zero); }
  }
  public static void Scroll(int amount) { mouse_event(0x0800, 0, 0, amount * 120, UIntPtr.Zero); }
}
`;

function keySequence(key: string, modifiers: string[] = []): string {
	const names: Record<string, string> = {
		enter: "{ENTER}",
		escape: "{ESC}",
		tab: "{TAB}",
		space: " ",
		up: "{UP}",
		down: "{DOWN}",
		left: "{LEFT}",
		right: "{RIGHT}",
		backspace: "{BACKSPACE}",
		delete: "{DELETE}",
		pageup: "{PGUP}",
		pagedown: "{PGDN}",
		home: "{HOME}",
		end: "{END}",
	};
	const prefix = modifiers
		.map((modifier) => ({ control: "^", command: "^", option: "%", shift: "+" })[modifier] ?? "")
		.join("");
	return `${prefix}${names[key] ?? key}`;
}

export async function captureWindowsScreenshot(options: WindowsComputerUseOptions): Promise<WindowsComputerUseCapture> {
	const outputDir = join(options.agentDir, "computer-use");
	mkdirSync(outputDir, { recursive: true });
	const path = join(outputDir, "last-screenshot.png");
	await runPowerShell(screenshotScript, [path]);
	return { path, data: readFileSync(path).toString("base64") };
}

export async function dispatchWindowsInput(input: WindowsInputRequest): Promise<string> {
	if (input.action === "click") {
		if (!Number.isFinite(input.x) || !Number.isFinite(input.y)) throw new Error("click requires finite x and y.");
		const count = input.clicks === 2 ? 2 : 1;
		await runPowerShell(
			`Add-Type -TypeDefinition @'${inputType}'@; [PorcupineInput]::Click([int]$args[0], [int]$args[1], [int]$args[2])`,
			[String(Math.round(input.x as number)), String(Math.round(input.y as number)), String(count)],
		);
		return `Clicked ${count === 2 ? "twice" : "once"} at (${Math.round(input.x as number)}, ${Math.round(input.y as number)}).`;
	}
	if (input.action === "type") {
		if (!input.text) throw new Error("type requires non-empty text.");
		assertSafeComputerUseText(input.text);
		await runPowerShell(`Add-Type -TypeDefinition @'${inputType}'@; [PorcupineInput]::TypeText($args[0])`, [
			input.text,
		]);
		return `Typed ${input.text.length} characters.`;
	}
	if (input.action === "key") {
		if (!input.key) throw new Error("key requires a supported key name.");
		assertSafeComputerUseKey(input.key, input.modifiers);
		const sequence = keySequence(input.key, input.modifiers);
		await runPowerShell(
			"Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait($args[0])",
			[sequence],
		);
		return `Pressed ${[...(input.modifiers ?? []), input.key].join("+")}.`;
	}
	const amount = Math.max(-10, Math.min(10, Math.trunc(input.amount ?? 1)));
	if (!amount) throw new Error("scroll amount must not be zero.");
	await runPowerShell(`Add-Type -TypeDefinition @'${inputType}'@; [PorcupineInput]::Scroll([int]$args[0])`, [
		String(amount),
	]);
	return `Scrolled ${Math.abs(amount)} page(s) ${amount > 0 ? "down" : "up"}.`;
}

export function windowsComputerUseStatus(): string {
	return "Windows native backend: PowerShell screen capture and user32 input adapter configured. Runtime verification requires an interactive Windows desktop session.";
}
