import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Markdown } from "../src/components/markdown.ts";
import { getCapabilities, hyperlink, resetCapabilitiesCache, setCapabilities } from "../src/terminal-image.ts";
import { defaultMarkdownTheme } from "./test-themes.ts";

describe("cbF OSC8 hyperlink injection", () => {
	beforeEach(() => {
		resetCapabilitiesCache();
		setCapabilities({ images: null, trueColor: true, hyperlinks: true });
	});
	afterEach(() => {
		resetCapabilitiesCache();
	});

	it("hyperlink() sanitizes control bytes so terminal escape injection cannot escape", () => {
		// A malicious URL containing a BEL-terminated OSC 0 title sequence must NOT
		// emit the attacker's control bytes into the write path.
		const url = "https://example.com/\x1b]0;OWNED\x07";
		const rendered = hyperlink("click", url);
		// The ESC and BEL that would have broken out of the OSC 8 must be stripped,
		// so no BEL byte and no standalone OSC-terminator payload survive.
		assert.ok(!rendered.includes("\x1b]0;OWNED\x07"), "title injection must not reach terminal write path");
		assert.ok(!rendered.includes("\u0007"), "no BEL emergency byte may survive in output");
		assert.ok(!rendered.includes("?\x1b]0"), "no standalone ESC OSC outside the hyperlink wrapper");
		// The visible text and the benign URL prefix still render.
		assert.ok(rendered.includes("https://example.com/"));
		assert.ok(rendered.includes("\x1b]8;;"));
	});

	it("markdown link href from model content is sanitized before entering the OSC8 sequence", () => {
		const evil = "https://evil/\x1b[2J";
		const md = new Markdown(`[click me](${evil})`, 1, 0, defaultMarkdownTheme);
		const rendered = md.render(80).join("\n");
		// The CSI Clear Screen byte inside the href must NOT survive into output.
		assert.ok(!rendered.includes("\x1b[2J"), "CSI clear-screen byte must not leak from link destination");
	});

	it("markdown raw HTML token containing control bytes is sanitized", () => {
		const md = new Markdown("<b>\x1b]0;HACKED\x07</b>", 1, 0, defaultMarkdownTheme);
		const rendered = md.render(80).join("\n");
		// The BEL-terminated title-set bytes must not reach the terminal.
		assert.ok(!rendered.includes("\x1b]0;HACKED\x07"), "html raw text control bytes must not reach terminal output");
		assert.ok(!rendered.includes("\u0007"), "no BEL byte may reach terminal output");
		assert.ok(!rendered.includes("\u001b]0"), "no ESC-OSC payload may reach terminal output");
	});
});
