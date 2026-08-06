import type { InlineExtension } from "../core/extensions/types.ts";
import imageScraperExtension from "./image-scraper/index.ts";
import llamaExtension from "./llama/index.ts";

export const builtInExtensions: InlineExtension[] = [
	{ name: "llama.cpp", factory: llamaExtension, hidden: true },
	{ name: "image-scraper", factory: imageScraperExtension, hidden: true },
];
