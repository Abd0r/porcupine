const HEADER_HORIZONTAL_PADDING = 2;

export const PORCUPINE_BLOCK_WORDMARK_COLOR = "#5EEAD4";

export const PORCUPINE_BLOCK_WORDMARK = `██████╗  ██████╗ ██████╗  ██████╗██╗   ██╗██████╗ ██╗███╗   ██╗███████╗
██╔══██╗██╔═══██╗██╔══██╗██╔════╝██║   ██║██╔══██╗██║████╗  ██║██╔════╝
██████╔╝██║   ██║██████╔╝██║     ██║   ██║██████╔╝██║██╔██╗ ██║█████╗
██╔═══╝ ██║   ██║██╔══██╗██║     ██║   ██║██╔═══╝ ██║██║╚██╗██║██╔══╝
██║     ╚██████╔╝██║  ██║╚██████╗╚██████╔╝██║     ██║██║ ╚████║███████╗
╚═╝      ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚═╝     ╚═╝╚═╝  ╚═══╝╚══════╝`;

export const PORCUPINE_BLOCK_WORDMARK_WIDTH = Math.max(
	...PORCUPINE_BLOCK_WORDMARK.split("\n").map((line) => line.length),
);

export const PORCUPINE_BLOCK_WORDMARK_MIN_COLUMNS = PORCUPINE_BLOCK_WORDMARK_WIDTH + HEADER_HORIZONTAL_PADDING;

/** Return the block wordmark when the startup header can display it without wrapping. */
export function getPorcupineBlockWordmark(columns: number): string | undefined {
	return columns >= PORCUPINE_BLOCK_WORDMARK_MIN_COLUMNS ? PORCUPINE_BLOCK_WORDMARK : undefined;
}
