export {
	type AskQuestionToolDetails,
	type AskQuestionToolInput,
	createAskQuestionTool,
	createAskQuestionToolDefinition,
} from "./ask-question.ts";
export {
	type BashOperations,
	type BashSpawnContext,
	type BashSpawnHook,
	type BashToolDetails,
	type BashToolInput,
	type BashToolOptions,
	createBashTool,
	createBashToolDefinition,
	createLocalBashOperations,
} from "./bash.ts";
export {
	type CapabilityCatalogTool,
	type CapabilitySearchToolDetails,
	type CapabilitySearchToolInput,
	type CapabilitySearchToolOptions,
	createCapabilitySearchTool,
	createCapabilitySearchToolDefinition,
} from "./capability-search.ts";
export {
	type ComputerUseToolDetails,
	type ComputerUseToolInput,
	type ComputerUseToolOptions,
	createComputerUseTool,
	createComputerUseToolDefinition,
} from "./computer-use.ts";
export {
	createEditTool,
	createEditToolDefinition,
	type EditOperations,
	type EditToolDetails,
	type EditToolInput,
	type EditToolOptions,
} from "./edit.ts";
export { withFileMutationQueue } from "./file-mutation-queue.ts";
export {
	createFindTool,
	createFindToolDefinition,
	type FindOperations,
	type FindToolDetails,
	type FindToolInput,
	type FindToolOptions,
} from "./find.ts";
export {
	createGrepTool,
	createGrepToolDefinition,
	type GrepOperations,
	type GrepToolDetails,
	type GrepToolInput,
	type GrepToolOptions,
} from "./grep.ts";
export {
	createLiteratureTool,
	createLiteratureToolDefinition,
	type LiteratureToolDetails,
	type LiteratureToolInput,
	type LiteratureToolOptions,
} from "./literature.ts";
export {
	createLsTool,
	createLsToolDefinition,
	type LsOperations,
	type LsToolDetails,
	type LsToolInput,
	type LsToolOptions,
} from "./ls.ts";
export {
	createMemoryTool,
	createMemoryToolDefinition,
	type MemoryToolDetails,
	type MemoryToolInput,
	type MemoryToolOptions,
} from "./memory.ts";
export {
	createProjectsTool,
	createProjectsToolDefinition,
	type ProjectsToolDetails,
	type ProjectsToolInput,
	type ProjectsToolOptions,
} from "./projects.ts";
export {
	createReadTool,
	createReadToolDefinition,
	type ReadOperations,
	type ReadToolDetails,
	type ReadToolInput,
	type ReadToolOptions,
} from "./read.ts";
export {
	createSessionSearchTool,
	createSessionSearchToolDefinition,
	type SessionSearchToolDetails,
	type SessionSearchToolInput,
	type SessionSearchToolOptions,
} from "./session-search.ts";
export {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	type TruncationOptions,
	type TruncationResult,
	truncateHead,
	truncateLine,
	truncateTail,
} from "./truncate.ts";
export {
	createWebExtractTool,
	createWebExtractToolDefinition,
	extractUrl,
	type WebExtractToolDetails,
	type WebExtractToolInput,
} from "./web-extract.ts";
export {
	type BackendName,
	createWebSearchTool,
	createWebSearchToolDefinition,
	DEFAULT_WEB_SEARCH_ORDER,
	resolveWebSearchOrder,
	runFreeWebSearch,
	type WebSearchHit,
	type WebSearchToolDetails,
	type WebSearchToolInput,
} from "./web-search.ts";
export {
	createWriteTool,
	createWriteToolDefinition,
	type WriteOperations,
	type WriteToolInput,
	type WriteToolOptions,
} from "./write.ts";

import type { AgentTool } from "@porcupineai/agent-core";
import type { ToolDefinition } from "../extensions/types.ts";
import { createAskQuestionTool, createAskQuestionToolDefinition } from "./ask-question.ts";
import { type BashToolOptions, createBashTool, createBashToolDefinition } from "./bash.ts";
import {
	type CapabilitySearchToolOptions,
	createCapabilitySearchTool,
	createCapabilitySearchToolDefinition,
} from "./capability-search.ts";
import { type ComputerUseToolOptions, createComputerUseTool, createComputerUseToolDefinition } from "./computer-use.ts";
import { createEditTool, createEditToolDefinition, type EditToolOptions } from "./edit.ts";
import { createFindTool, createFindToolDefinition, type FindToolOptions } from "./find.ts";
import { createGrepTool, createGrepToolDefinition, type GrepToolOptions } from "./grep.ts";
import { createLiteratureTool, createLiteratureToolDefinition, type LiteratureToolOptions } from "./literature.ts";
import { createLsTool, createLsToolDefinition, type LsToolOptions } from "./ls.ts";
import { createMcpResourcesToolDefinition, createUnavailableMcpResourcesToolDefinition } from "./mcp-resources.ts";
import { createMemoryTool, createMemoryToolDefinition, type MemoryToolOptions } from "./memory.ts";
import { createProjectsTool, createProjectsToolDefinition, type ProjectsToolOptions } from "./projects.ts";
import { createReadTool, createReadToolDefinition, type ReadToolOptions } from "./read.ts";
import {
	createSessionSearchTool,
	createSessionSearchToolDefinition,
	type SessionSearchToolOptions,
} from "./session-search.ts";
import {
	createSendToSubagentToolDefinition,
	createStopSubagentToolDefinition,
	createSubagentToolDefinition,
	createUnavailableSendToSubagentToolDefinition,
	createUnavailableStopSubagentToolDefinition,
	createUnavailableSubagentToolDefinition,
	type SubagentToolOptions,
} from "./subagent.ts";
import { createTasksTool, createTasksToolDefinition, type TasksToolOptions } from "./tasks.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";
import { createWebExtractTool, createWebExtractToolDefinition } from "./web-extract.ts";
import { createWebSearchTool, createWebSearchToolDefinition } from "./web-search.ts";
import { createWriteTool, createWriteToolDefinition, type WriteToolOptions } from "./write.ts";

export type Tool = AgentTool<any>;
export type ToolDef = ToolDefinition<any, any>;
export type ToolName =
	| "ask_question"
	| "read"
	| "bash"
	| "edit"
	| "write"
	| "grep"
	| "find"
	| "ls"
	| "web_search"
	| "web_extract"
	| "computer_use"
	| "capability_search"
	| "memory"
	| "session_search"
	| "tasks"
	| "projects"
	| "literature"
	| "subagent"
	| "send_to_subagent"
	| "stop_subagent"
	| "mcp_resources";
export const allToolNames: Set<ToolName> = new Set([
	"ask_question",
	"read",
	"bash",
	"edit",
	"write",
	"grep",
	"find",
	"ls",
	"web_search",
	"web_extract",
	"computer_use",
	"capability_search",
	"memory",
	"session_search",
	"tasks",
	"projects",
	"literature",
	"subagent",
	"send_to_subagent",
	"stop_subagent",
	"mcp_resources",
]);

export interface ToolsOptions {
	read?: ReadToolOptions;
	bash?: BashToolOptions;
	write?: WriteToolOptions;
	edit?: EditToolOptions;
	grep?: GrepToolOptions;
	find?: FindToolOptions;
	ls?: LsToolOptions;
	computer_use?: ComputerUseToolOptions;
	capability_search?: CapabilitySearchToolOptions;
	memory?: MemoryToolOptions;
	session_search?: SessionSearchToolOptions;
	tasks?: TasksToolOptions;
	projects?: ProjectsToolOptions;
	literature?: LiteratureToolOptions;
	subagent?: SubagentToolOptions;
	sendToSubagent?: import("./subagent.ts").SendToSubagentToolOptions;
	stopSubagent?: import("./subagent.ts").StopSubagentToolOptions;
	mcpResources?: import("./mcp-resources.ts").McpResourcesToolOptions;
}

export function createToolDefinition(toolName: ToolName, cwd: string, options?: ToolsOptions): ToolDef {
	switch (toolName) {
		case "ask_question":
			return createAskQuestionToolDefinition();
		case "read":
			return createReadToolDefinition(cwd, options?.read);
		case "bash":
			return createBashToolDefinition(cwd, options?.bash);
		case "edit":
			return createEditToolDefinition(cwd, options?.edit);
		case "write":
			return createWriteToolDefinition(cwd, options?.write);
		case "grep":
			return createGrepToolDefinition(cwd, options?.grep);
		case "find":
			return createFindToolDefinition(cwd, options?.find);
		case "ls":
			return createLsToolDefinition(cwd, options?.ls);
		case "web_search":
			return createWebSearchToolDefinition();
		case "web_extract":
			return createWebExtractToolDefinition();
		case "computer_use":
			return createComputerUseToolDefinition(options?.computer_use);
		case "capability_search":
			return createCapabilitySearchToolDefinition({
				cwd,
				...options?.capability_search,
				getTools:
					options?.capability_search?.getTools ?? (() => Object.values(createAllToolDefinitions(cwd, options))),
			});
		case "memory":
			return createMemoryToolDefinition(options?.memory);
		case "session_search":
			return createSessionSearchToolDefinition({ cwd, ...options?.session_search });
		case "tasks":
			return createTasksToolDefinition(options?.tasks);
		case "projects":
			return createProjectsToolDefinition(options?.projects);
		case "literature":
			return createLiteratureToolDefinition(options?.literature);
		default:
			throw new Error(`Unknown tool name: ${toolName}`);
	}
}

export function createTool(toolName: ToolName, cwd: string, options?: ToolsOptions): Tool {
	switch (toolName) {
		case "ask_question":
			return createAskQuestionTool();
		case "read":
			return createReadTool(cwd, options?.read);
		case "bash":
			return createBashTool(cwd, options?.bash);
		case "edit":
			return createEditTool(cwd, options?.edit);
		case "write":
			return createWriteTool(cwd, options?.write);
		case "grep":
			return createGrepTool(cwd, options?.grep);
		case "find":
			return createFindTool(cwd, options?.find);
		case "ls":
			return createLsTool(cwd, options?.ls);
		case "web_search":
			return createWebSearchTool();
		case "web_extract":
			return createWebExtractTool();
		case "computer_use":
			return createComputerUseTool(options?.computer_use);
		case "capability_search":
			return createCapabilitySearchTool({
				cwd,
				...options?.capability_search,
				getTools:
					options?.capability_search?.getTools ?? (() => Object.values(createAllToolDefinitions(cwd, options))),
			});
		case "memory":
			return createMemoryTool(options?.memory);
		case "session_search":
			return createSessionSearchTool({ cwd, ...options?.session_search });
		default:
			throw new Error(`Unknown tool name: ${toolName}`);
	}
}

function createCapabilityCatalogDefinition(cwd: string, options?: ToolsOptions): ToolDef {
	return createCapabilitySearchToolDefinition({
		cwd,
		...options?.capability_search,
		getTools: options?.capability_search?.getTools ?? (() => Object.values(createAllToolDefinitions(cwd, options))),
	});
}

function createCapabilityCatalogTool(cwd: string, options?: ToolsOptions): Tool {
	return createCapabilitySearchTool({
		cwd,
		...options?.capability_search,
		getTools: options?.capability_search?.getTools ?? (() => Object.values(createAllToolDefinitions(cwd, options))),
	});
}

export function createCodingToolDefinitions(cwd: string, options?: ToolsOptions): ToolDef[] {
	return [
		createAskQuestionToolDefinition(),
		createReadToolDefinition(cwd, options?.read),
		createBashToolDefinition(cwd, options?.bash),
		createEditToolDefinition(cwd, options?.edit),
		createWriteToolDefinition(cwd, options?.write),
		createWebSearchToolDefinition(),
		createWebExtractToolDefinition(),
		createComputerUseToolDefinition(options?.computer_use),
		createCapabilityCatalogDefinition(cwd, options),
		createMemoryToolDefinition(options?.memory),
		createProjectsToolDefinition(options?.projects),
		createSessionSearchToolDefinition({ cwd, ...options?.session_search }),
		createTasksToolDefinition(options?.tasks),
		createLiteratureToolDefinition(options?.literature),
	];
}

export function createReadOnlyToolDefinitions(cwd: string, options?: ToolsOptions): ToolDef[] {
	return [
		createAskQuestionToolDefinition(),
		createReadToolDefinition(cwd, options?.read),
		createGrepToolDefinition(cwd, options?.grep),
		createFindToolDefinition(cwd, options?.find),
		createLsToolDefinition(cwd, options?.ls),
		createWebSearchToolDefinition(),
		createWebExtractToolDefinition(),
		createComputerUseToolDefinition(options?.computer_use),
		createCapabilityCatalogDefinition(cwd, options),
		createMemoryToolDefinition(options?.memory),
		createProjectsToolDefinition(options?.projects),
		createSessionSearchToolDefinition({ cwd, ...options?.session_search }),
	];
}

export function createAllToolDefinitions(cwd: string, options?: ToolsOptions): Record<ToolName, ToolDef> {
	return {
		ask_question: createAskQuestionToolDefinition(),
		read: createReadToolDefinition(cwd, options?.read),
		bash: createBashToolDefinition(cwd, options?.bash),
		edit: createEditToolDefinition(cwd, options?.edit),
		write: createWriteToolDefinition(cwd, options?.write),
		grep: createGrepToolDefinition(cwd, options?.grep),
		find: createFindToolDefinition(cwd, options?.find),
		ls: createLsToolDefinition(cwd, options?.ls),
		web_search: createWebSearchToolDefinition(),
		web_extract: createWebExtractToolDefinition(),
		computer_use: createComputerUseToolDefinition(options?.computer_use),
		capability_search: createCapabilitySearchToolDefinition({
			cwd,
			...options?.capability_search,
			getTools:
				options?.capability_search?.getTools ?? (() => Object.values(createAllToolDefinitions(cwd, options))),
		}),
		memory: createMemoryToolDefinition(options?.memory),
		projects: createProjectsToolDefinition(options?.projects),
		session_search: createSessionSearchToolDefinition({ cwd, ...options?.session_search }),
		tasks: createTasksToolDefinition(options?.tasks),
		literature: createLiteratureToolDefinition(options?.literature),
		subagent: options?.subagent
			? createSubagentToolDefinition(options.subagent)
			: createUnavailableSubagentToolDefinition(),
		send_to_subagent: options?.sendToSubagent
			? createSendToSubagentToolDefinition(options.sendToSubagent)
			: createUnavailableSendToSubagentToolDefinition(),
		stop_subagent: options?.stopSubagent
			? createStopSubagentToolDefinition(options.stopSubagent)
			: createUnavailableStopSubagentToolDefinition(),
		mcp_resources: options?.mcpResources
			? createMcpResourcesToolDefinition(options.mcpResources)
			: createUnavailableMcpResourcesToolDefinition(),
	};
}

export function createCodingTools(cwd: string, options?: ToolsOptions): Tool[] {
	return [
		createAskQuestionTool(),
		createReadTool(cwd, options?.read),
		createBashTool(cwd, options?.bash),
		createEditTool(cwd, options?.edit),
		createWriteTool(cwd, options?.write),
		createWebSearchTool(),
		createWebExtractTool(),
		createComputerUseTool(options?.computer_use),
		createCapabilityCatalogTool(cwd, options),
		createMemoryTool(options?.memory),
		createProjectsTool(options?.projects),
		createSessionSearchTool({ cwd, ...options?.session_search }),
		createTasksTool(options?.tasks),
		createLiteratureTool(options?.literature),
	];
}

export function createReadOnlyTools(cwd: string, options?: ToolsOptions): Tool[] {
	return [
		createAskQuestionTool(),
		createReadTool(cwd, options?.read),
		createGrepTool(cwd, options?.grep),
		createFindTool(cwd, options?.find),
		createLsTool(cwd, options?.ls),
		createWebSearchTool(),
		createWebExtractTool(),
		createComputerUseTool(options?.computer_use),
		createCapabilityCatalogTool(cwd, options),
		createMemoryTool(options?.memory),
		createProjectsTool(options?.projects),
		createSessionSearchTool({ cwd, ...options?.session_search }),
	];
}

export function createAllTools(cwd: string, options?: ToolsOptions): Record<ToolName, Tool> {
	return {
		ask_question: createAskQuestionTool(),
		read: createReadTool(cwd, options?.read),
		bash: createBashTool(cwd, options?.bash),
		edit: createEditTool(cwd, options?.edit),
		write: createWriteTool(cwd, options?.write),
		grep: createGrepTool(cwd, options?.grep),
		find: createFindTool(cwd, options?.find),
		ls: createLsTool(cwd, options?.ls),
		web_search: createWebSearchTool(),
		web_extract: createWebExtractTool(),
		computer_use: createComputerUseTool(options?.computer_use),
		capability_search: createCapabilitySearchTool({
			cwd,
			...options?.capability_search,
			getTools:
				options?.capability_search?.getTools ?? (() => Object.values(createAllToolDefinitions(cwd, options))),
		}),
		memory: createMemoryTool(options?.memory),
		projects: createProjectsTool(options?.projects),
		session_search: createSessionSearchTool({ cwd, ...options?.session_search }),
		tasks: createTasksTool(options?.tasks),
		literature: createLiteratureTool(options?.literature),
		subagent: wrapToolDefinition(
			options?.subagent ? createSubagentToolDefinition(options.subagent) : createUnavailableSubagentToolDefinition(),
		),
		send_to_subagent: wrapToolDefinition(
			options?.sendToSubagent
				? createSendToSubagentToolDefinition(options.sendToSubagent)
				: createUnavailableSendToSubagentToolDefinition(),
		),
		stop_subagent: wrapToolDefinition(
			options?.stopSubagent
				? createStopSubagentToolDefinition(options.stopSubagent)
				: createUnavailableStopSubagentToolDefinition(),
		),
		mcp_resources: wrapToolDefinition(
			options?.mcpResources
				? createMcpResourcesToolDefinition(options.mcpResources)
				: createUnavailableMcpResourcesToolDefinition(),
		),
	};
}
