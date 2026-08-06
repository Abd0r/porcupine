/**
 * Project workspaces tool — read-only access to Project/<name>/ workspaces.
 *
 * Workspaces follow the project-hygiene skill: a canonical Project/<project-name>/
 * directory with README.md (why it exists) and STATUS.md (verified state, blockers,
 * next verified action). This tool lists, searches, and views them so the agent can
 * resume cross-session work instead of guessing.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { AgentTool } from "@porcupineai/agent-core";
import { Text } from "@porcupineai/tui";
import { type Static, Type } from "typebox";
import { theme } from "../../modes/interactive/theme/theme.ts";
import { formatProjectsCommandOutput, searchProjects } from "../../porcupine/project-search.ts";
import type { ToolDefinition } from "../extensions/types.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

const projectsSchema = Type.Object({
	action: Type.Optional(
		Type.Union([Type.Literal("list"), Type.Literal("search"), Type.Literal("view")], {
			description: "list (default) | search | view",
		}),
	),
	query: Type.Optional(
		Type.String({
			description:
				"Search text (search) or exact project directory name under Project/ (view). Default list shows everything.",
		}),
	),
});

export type ProjectsToolInput = Static<typeof projectsSchema>;

export interface ProjectsToolDetails {
	action: string;
	query?: string;
	count: number;
}

export interface ProjectsToolOptions {
	/** Working directory that owns the Project/ root. Defaults to process.cwd(). */
	cwd?: string;
}

const MAX_DOCUMENT_BYTES = 64 * 1024;

/** Read a workspace document, bounded and silent on failure. */
function readBounded(filePath: string): string | undefined {
	try {
		const stat = statSync(filePath);
		if (!stat.isFile() || stat.size > MAX_DOCUMENT_BYTES) return undefined;
		return readFileSync(filePath, "utf8");
	} catch {
		return undefined;
	}
}

/** Resolve a workspace path, refusing traversal outside Project/<name>. */
function resolveWorkspace(cwd: string, name: string): string | undefined {
	const trimmed = name.trim();
	if (!trimmed || trimmed.includes("/") || trimmed.includes("\\") || trimmed === "." || trimmed === "..") {
		return undefined;
	}
	const path = join(cwd, "Project", trimmed);
	return existsSync(path) ? path : undefined;
}

function formatProjectDetail(cwd: string, name: string): string {
	const path = resolveWorkspace(cwd, name);
	if (!path) {
		return `No project workspace named ${JSON.stringify(name)} under Project/. Run action=list to see what exists.`;
	}
	const readme = readBounded(join(path, "README.md"));
	const status = readBounded(join(path, "STATUS.md"));
	const sections: string[] = [];
	if (status) sections.push(status.trim());
	if (readme) sections.push(readme.trim());
	if (sections.length === 0) {
		return `Project/${name} exists but has no README.md or STATUS.md yet.\nCreate them with the project-hygiene skill.`;
	}
	return `Project/${name}\n\n${sections.join("\n\n---\n\n")}`;
}

export function createProjectsToolDefinition(
	options?: ProjectsToolOptions,
): ToolDefinition<typeof projectsSchema, ProjectsToolDetails | undefined> {
	const cwd = options?.cwd ?? process.cwd();

	return {
		name: "projects",
		label: "projects",
		description:
			"Read-only access to Project/<name>/ workspaces (project-hygiene skill). action=list (default) shows all workspaces with state + hygiene hints; action=search finds workspaces by objective, status, blocker, or next action; action=view shows one workspace's full README.md + STATUS.md so you can resume work with verified state instead of guessing.",
		promptSnippet: "List/search/view Project/ workspaces (cross-session handoff)",
		promptGuidelines: [
			"Use action=search with objective/status/blocker/next-action words before resuming multi-session work.",
			"action=view loads one workspace's README + STATUS only; use the read tool for other files inside it.",
			"Workspaces live in Project/<name>/ with README.md (purpose) and STATUS.md (verified state, blockers, next action).",
			"If no workspace matches, the project-hygiene skill can create one — do not improvise a competing status document.",
		],
		parameters: projectsSchema,
		async execute(_toolCallId, args) {
			const action = args.action ?? (args.query?.trim() ? "search" : "list");
			const query = args.query?.trim() ?? "";
			let text: string;
			let count = 0;

			if (action === "view") {
				text = formatProjectDetail(cwd, query);
				count = query ? 1 : 0;
			} else if (action === "search") {
				text = formatProjectsCommandOutput(cwd, query);
				count = searchProjects(cwd, query).length;
			} else {
				text = formatProjectsCommandOutput(cwd);
				count = searchProjects(cwd).length;
			}

			return {
				content: [{ type: "text", text }],
				details: { action, query, count } satisfies ProjectsToolDetails,
			};
		},
		renderCall(args) {
			const action = String(args?.action ?? (args?.query ? "search" : "list"));
			const target = String(args?.query ?? "");
			return new Text(
				`${theme.fg("toolTitle", theme.bold("projects"))} ${theme.fg("toolOutput", `${action} ${target}`.trim())}`,
				0,
				0,
			);
		},
		renderResult(result, options) {
			const text = (result.content ?? [])
				.map((c) => (c.type === "text" ? c.text : ""))
				.join("")
				.trim();
			const preview = options.expanded ? text : text.split("\n").slice(0, 12).join("\n");
			return new Text(`\n${theme.fg("toolOutput", preview || "(empty)")}`, 0, 0);
		},
	};
}

export function createProjectsTool(options?: ProjectsToolOptions): AgentTool<typeof projectsSchema> {
	return wrapToolDefinition(createProjectsToolDefinition(options));
}
