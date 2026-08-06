import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const PROJECTS_DIRECTORY = "Project";
const README_FILE = "README.md";
const STATUS_FILE = "STATUS.md";
const MAX_PROJECT_DOCUMENT_BYTES = 64 * 1024;
const OUTPUT_SUMMARY_LIMIT = 160;

export interface PorcupineProject {
	name: string;
	path: string;
	readmePath?: string;
	statusPath?: string;
	title: string;
	state?: string;
	statusSummary?: string;
	searchText: string;
}

function readBoundedProjectDocument(filePath: string): string | undefined {
	try {
		const stat = statSync(filePath);
		if (!stat.isFile() || stat.size > MAX_PROJECT_DOCUMENT_BYTES) return undefined;
		return readFileSync(filePath, "utf8");
	} catch {
		return undefined;
	}
}

function firstMarkdownHeading(content: string | undefined): string | undefined {
	return content
		?.split("\n")
		.map((line) => line.match(/^#\s+(.+?)\s*$/)?.[1]?.trim())
		.find(Boolean);
}

function firstMeaningfulLine(content: string | undefined): string | undefined {
	return content
		?.split("\n")
		.map((line) => line.trim())
		.find((line) => Boolean(line) && !line.startsWith("#") && !line.startsWith("`"));
}

function extractStatusState(content: string | undefined): string | undefined {
	const match = content?.match(/^##\s+State\s*\n+\s*`?([^`\n]+)`?/im);
	return match?.[1]?.trim();
}

function compact(value: string | undefined, limit = OUTPUT_SUMMARY_LIMIT): string | undefined {
	if (!value) return undefined;
	const normalized = value.replace(/\s+/g, " ").trim();
	if (normalized.length <= limit) return normalized;
	return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function matchesQuery(project: PorcupineProject, query: string): boolean {
	const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
	if (terms.length === 0) return true;
	const haystack = project.searchText.toLowerCase();
	return terms.every((term) => haystack.includes(term));
}

/**
 * Index direct child workspaces under <cwd>/Project. The search is intentionally
 * shallow and ignores symbolic links, keeping /projects predictable and read-only.
 */
export function discoverProjects(cwd: string): PorcupineProject[] {
	const projectsRoot = join(cwd, PROJECTS_DIRECTORY);
	if (!existsSync(projectsRoot)) return [];

	try {
		return readdirSync(projectsRoot, { withFileTypes: true })
			.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
			.map((entry) => {
				const path = join(projectsRoot, entry.name);
				const readmePath = join(path, README_FILE);
				const statusPath = join(path, STATUS_FILE);
				const readme = readBoundedProjectDocument(readmePath);
				const status = readBoundedProjectDocument(statusPath);
				const title = firstMarkdownHeading(readme) ?? entry.name;
				return {
					name: entry.name,
					path,
					...(readme !== undefined ? { readmePath } : {}),
					...(status !== undefined ? { statusPath } : {}),
					title,
					...(extractStatusState(status) ? { state: extractStatusState(status) } : {}),
					...(compact(firstMeaningfulLine(status)) ? { statusSummary: compact(firstMeaningfulLine(status)) } : {}),
					searchText: [entry.name, readme ?? "", status ?? ""].join("\n"),
				};
			})
			.sort((left, right) => left.name.localeCompare(right.name));
	} catch {
		return [];
	}
}

export function searchProjects(cwd: string, query = ""): PorcupineProject[] {
	return discoverProjects(cwd).filter((project) => matchesQuery(project, query));
}

/** Format /projects output without exposing complete project documents. */
export function formatProjectsCommandOutput(cwd: string, query = ""): string {
	const normalizedQuery = query.trim();
	const projects = searchProjects(cwd, normalizedQuery);
	const allProjects = normalizedQuery ? discoverProjects(cwd) : projects;

	if (allProjects.length === 0) {
		return `No project workspaces found at ${PROJECTS_DIRECTORY}/.\nCreate ${PROJECTS_DIRECTORY}/<project-name>/README.md and STATUS.md with the project-hygiene skill.`;
	}
	if (projects.length === 0) {
		return `No project matches for ${JSON.stringify(normalizedQuery)}.\nTry a project name, objective, status, blocker, or next action.`;
	}

	const lines = [
		normalizedQuery
			? `Project search: ${normalizedQuery}  (${projects.length} hit${projects.length === 1 ? "" : "s"})`
			: `Projects (${projects.length})`,
		"",
	];
	for (const project of projects) {
		const state = project.state ? `  [${project.state}]` : "  [status missing]";
		lines.push(`• ${project.title}${state}`);
		lines.push(`  path: ${relative(cwd, project.path) || PROJECTS_DIRECTORY}`);
		if (project.statusSummary) lines.push(`  ${project.statusSummary}`);
		if (!project.readmePath || !project.statusPath) {
			const missing = [!project.readmePath && README_FILE, !project.statusPath && STATUS_FILE]
				.filter(Boolean)
				.join(", ");
			lines.push(`  hygiene: missing ${missing}`);
		}
		lines.push("");
	}
	lines.push("Tip: /projects <query> searches project names, README.md, and STATUS.md.");
	return lines.join("\n").trimEnd();
}
