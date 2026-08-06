/**
 * @deprecated Import from `./animations.ts` instead.
 * Thin re-export kept so older imports keep compiling during the migration.
 */
export {
	ACTIVITY_DOT_FRAMES,
	type AnimationId as PorcupineActivityPhase,
	activityIndicatorOptions,
	buildActivityFrames,
	DEFAULT_ACTIVITY_INTERVAL_MS,
	formatActivityLine,
	formatAnimationMessage,
	getPorcupineActivity,
	normalizeActivityPhase,
	normalizeAnimationId,
	PORCUPINE_ACTIVITIES,
	resolveActivityFromText,
	resolveActivityFromToolName,
	resolveAnimationFromText,
	resolveAnimationFromToolName,
} from "./animations.ts";
