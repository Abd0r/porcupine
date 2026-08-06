import { Container, type SelectItem, SelectList, type SelectListLayoutOptions } from "@porcupineai/tui";
import type { InteractionMode } from "../../../porcupine/interaction-mode.ts";
import { getSelectListTheme } from "../theme/theme.ts";
import { DynamicBorder } from "./dynamic-border.ts";

const MODE_SELECT_LIST_LAYOUT: SelectListLayoutOptions = {
	minPrimaryColumnWidth: 15,
	maxPrimaryColumnWidth: 24,
};

const MODE_ITEMS: SelectItem[] = [
	{
		value: "ask",
		label: "✋ Ask",
		description: "Confirm every command and file edit.",
	},
	{
		value: "normal",
		label: "🛡️  Normal",
		description: "Run safe commands; confirm flagged commands.",
	},
	{
		value: "auto",
		label: "⚡ Auto",
		description: "Use the LLM safety gate for flagged commands.",
	},
];

/** Bordered picker for the session's command and edit approval policy. */
export class InteractionModeSelectorComponent extends Container {
	private selectList: SelectList;

	constructor(currentMode: InteractionMode, onSelect: (mode: InteractionMode) => void, onCancel: () => void) {
		super();
		this.addChild(new DynamicBorder());
		this.selectList = new SelectList(MODE_ITEMS, MODE_ITEMS.length, getSelectListTheme(), MODE_SELECT_LIST_LAYOUT);
		const currentIndex = MODE_ITEMS.findIndex((item) => item.value === currentMode);
		if (currentIndex !== -1) this.selectList.setSelectedIndex(currentIndex);
		this.selectList.onSelect = (item) => onSelect(item.value as InteractionMode);
		this.selectList.onCancel = onCancel;
		this.addChild(this.selectList);
		this.addChild(new DynamicBorder());
	}

	getSelectList(): SelectList {
		return this.selectList;
	}
}
