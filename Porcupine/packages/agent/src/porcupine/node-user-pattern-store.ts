import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import type { UserPatternLearningAdapters, UserPatternProposal } from "./learning-loop.ts";

export interface NodeUserPatternLearningOptions {
	rootDir: string;
	extract(message: string): Promise<UserPatternProposal[]>;
}

function resolveWithinRoot(rootDir: string, filePath: string): string {
	const root = resolve(rootDir);
	const target = resolve(root, filePath);
	const relativePath = relative(root, target);
	if (
		relativePath === ".." ||
		relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
		isAbsolute(relativePath)
	) {
		throw new Error(`USER.md path is outside the configured root: ${filePath}`);
	}
	return target;
}

export function createNodeUserPatternLearningAdapters(
	options: NodeUserPatternLearningOptions,
): UserPatternLearningAdapters {
	return {
		extract: options.extract,
		async readUserFile(filePath) {
			const target = resolveWithinRoot(options.rootDir, filePath);
			try {
				return await readFile(target, "utf8");
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") return "# User\n";
				throw error;
			}
		},
		async writeUserFile(filePath, content) {
			const target = resolveWithinRoot(options.rootDir, filePath);
			await mkdir(dirname(target), { recursive: true });
			const temporaryPath = resolve(dirname(target), `.${basename(target)}.${process.pid}.${randomUUID()}.tmp`);
			try {
				await writeFile(temporaryPath, content, { encoding: "utf8", mode: 0o600 });
				await rename(temporaryPath, target);
			} finally {
				await rm(temporaryPath, { force: true });
			}
		},
	};
}
