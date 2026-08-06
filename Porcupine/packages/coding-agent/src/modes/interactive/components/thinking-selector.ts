import type { ThinkingLevel } from "@porcupineai/agent-core";
import { Container, type SelectItem, SelectList, type SelectListLayoutOptions } from "@porcupineai/tui";
import { getSelectListTheme } from "../theme/theme.ts";
import { DynamicBorder } from "./dynamic-border.ts";

const THINKING_SELECT_LIST_LAYOUT: SelectListLayoutOptions = {
	minPrimaryColumnWidth: 14,
	maxPrimaryColumnWidth: 36,
};

/** Fixed provider thinking levels plus Porcupine Adaptive mode. */
export type ReasoningMode = ThinkingLevel | "adaptive";

export const LEVEL_DESCRIPTIONS: Record<ThinkingLevel, string> = {
	off: "No reasoning",
	minimal: "Very brief reasoning (~1k tokens)",
	low: "Light reasoning (~2k tokens)",
	medium: "Moderate reasoning (~8k tokens)",
	high: "Deep reasoning (~16k tokens)",
	xhigh: "Extra-high reasoning (~32k tokens)",
	max: "Maximum reasoning",
};

const ADAPTIVE_DESCRIPTION = "Per-turn depth (model-picked: minimal…max)";

export function formatReasoningModeLabel(mode: ReasoningMode, lastAdaptive?: ThinkingLevel): string {
	if (mode === "adaptive") {
		return lastAdaptive ? `adaptive→${lastAdaptive}` : "adaptive";
	}
	return mode === "off" ? "thinking off" : mode;
}

export function parseReasoningModeArg(raw: string): ReasoningMode | undefined {
	const v = raw.trim().toLowerCase();
	if (!v) return undefined;
	if (v === "adaptive" || v === "auto" || v === "adapt") return "adaptive";
	const fixed: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
	if ((fixed as string[]).includes(v)) return v as ThinkingLevel;
	// common aliases
	if (v === "none" || v === "disabled") return "off";
	if (v === "min") return "minimal";
	if (v === "med") return "medium";
	if (v === "extra" || v === "extra-high" || v === "xl") return "xhigh";
	if (v === "maximum" || v === "ultra") return "max";
	return undefined;
}

/**
 * Component that renders a reasoning / thinking mode selector with borders.
 * Pi historically exposed this via /thinking; Porcupine uses /reasoning (alias /thinking).
 */
export class ThinkingSelectorComponent extends Container {
	private selectList: SelectList;

	constructor(
		currentMode: ReasoningMode,
		availableLevels: ThinkingLevel[],
		onSelect: (mode: ReasoningMode) => void,
		onCancel: () => void,
		options?: { includeAdaptive?: boolean },
	) {
		super();

		const includeAdaptive = options?.includeAdaptive !== false;
		const items: SelectItem[] = availableLevels.map((level) => ({
			value: level,
			label: level,
			description: LEVEL_DESCRIPTIONS[level],
		}));
		if (includeAdaptive) {
			items.push({
				value: "adaptive",
				label: "adaptive",
				description: ADAPTIVE_DESCRIPTION,
			});
		}

		this.addChild(new DynamicBorder());

		this.selectList = new SelectList(
			items,
			Math.min(items.length, 10),
			getSelectListTheme(),
			THINKING_SELECT_LIST_LAYOUT,
		);

		const currentIndex = items.findIndex((item) => item.value === currentMode);
		if (currentIndex !== -1) {
			this.selectList.setSelectedIndex(currentIndex);
		}

		this.selectList.onSelect = (item) => {
			onSelect(item.value as ReasoningMode);
		};

		this.selectList.onCancel = () => {
			onCancel();
		};

		this.addChild(this.selectList);
		this.addChild(new DynamicBorder());
	}

	getSelectList(): SelectList {
		return this.selectList;
	}
}
