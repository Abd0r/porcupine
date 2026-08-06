import { APP_NAME } from "../config.ts";
import type { SourceInfo } from "./source-info.ts";

export type SlashCommandSource = "extension" | "prompt" | "skill";

export interface SlashCommandInfo {
	name: string;
	description?: string;
	source: SlashCommandSource;
	sourceInfo: SourceInfo;
}

export interface BuiltinSlashCommand {
	name: string;
	description: string;
	argumentHint?: string;
}

export const BUILTIN_SLASH_COMMANDS: ReadonlyArray<BuiltinSlashCommand> = [
	{
		name: "guide",
		description: "Learn Porcupine workflows and capabilities",
		argumentHint: "[topic]",
	},
	{ name: "settings", description: "Open settings menu" },
	{
		name: "model",
		description: "Select model (opens selector UI)",
		argumentHint: "<provider/model>",
	},
	{
		name: "scoped-models",
		description: "Enable/disable models for Ctrl+P cycling",
	},
	{
		name: "export",
		description: "Export session (HTML default, or specify path: .html/.jsonl)",
	},
	{
		name: "import",
		description: "Import and resume a session from a JSONL file",
	},
	{ name: "share", description: "Share session as a secret GitHub gist" },
	{ name: "copy", description: "Copy last agent message to clipboard" },
	{ name: "name", description: "Set session display name" },
	{ name: "session", description: "Show session info and stats" },
	{ name: "changelog", description: "Show changelog entries" },
	{ name: "hotkeys", description: "Show all keyboard shortcuts" },
	{
		name: "fork",
		description: "Create a new fork from a previous user message",
	},
	{
		name: "clone",
		description: "Duplicate the current session at the current position",
	},
	{ name: "tree", description: "Navigate session tree (switch branches)" },
	{
		name: "trust",
		description: "Save project trust decision for future sessions",
	},
	{
		name: "login",
		description: "Configure provider authentication",
		argumentHint: "<provider>",
	},
	{ name: "logout", description: "Remove provider authentication" },
	{ name: "new", description: "Start a new session" },
	{ name: "compact", description: "Manually compact the session context" },
	{ name: "resume", description: "Resume a different session" },
	{
		name: "reload",
		description: "Reload keybindings, extensions, skills, prompts, themes, and context files",
	},
	{
		name: "refresh",
		description: "Rebuild whole Porcupine runtime and resume this session",
		argumentHint: "[skill|all]",
	},
	{
		name: "restart",
		description: "Fully restart Porcupine process and resume this session",
	},
	{
		name: "reasoning",
		description: "Select reasoning mode (thinking levels + adaptive)",
		argumentHint: "[off|minimal|low|medium|high|xhigh|max|adaptive]",
	},
	{
		name: "thinking",
		description: "Alias for /reasoning",
		argumentHint: "[off|minimal|low|medium|high|xhigh|max|adaptive]",
	},
	{
		name: "reasoning-show",
		description: "Show or hide reasoning blocks",
		argumentHint: "[yes|no]",
	},
	{
		name: "auto",
		description: "Auto Mode: LLM safety gate for flagged bash (session toggle)",
		argumentHint: "[on|off|status]",
	},
	{
		name: "sandbox",
		description: "Sandbox mode: route built-in tools into a Gondolin micro-VM",
		argumentHint: "[on|off|status]",
	},
	{
		name: "update",
		description: "Check for a newer Porcupine release and show how to install it",
	},
	{
		name: "modes",
		description: "Choose Ask, Normal, or Auto interaction mode",
	},
	{
		name: "adaptive",
		description: "Adaptive Reasoning toggle (or use /reasoning adaptive)",
		argumentHint: "[on|off|status]",
	},
	{
		name: "stacks",
		description: "Show tools/skills stack tree or search it",
		argumentHint: "[query|stack:id]",
	},
	{
		name: "voice",
		description: "Voice Mode: push-to-talk with Space (Moonshine STT + Kokoro TTS)",
		argumentHint: "[on|off|status]",
	},
	{
		name: "projects",
		description: "List or search Project workspaces",
		argumentHint: "[query]",
	},
	{
		name: "learning",
		description: "Show autonomous learning evidence graph",
		argumentHint: "[graph|history]",
	},
	{
		name: "goal",
		description: "Set a persistent session goal",
		argumentHint: "<text>|[status|pause|resume|clear]",
	},
	{
		name: "plan",
		description: "Generate and save a capability-aware plan",
		argumentHint: "<text>|[status|clear]",
	},
	{
		name: "task",
		description: "Create, run, and manage durable local tasks",
		argumentHint: "add <title> :: <prompt>|[list|show|run|pause|resume|cancel] <id>",
	},
	{
		name: "cron",
		description: "Schedule a durable local task while this session is open",
		argumentHint: "add <task-id> :: <cron>|[list|run|pause|resume|remove] <id>",
	},
	{ name: "quit", description: `Quit ${APP_NAME}` },
];
