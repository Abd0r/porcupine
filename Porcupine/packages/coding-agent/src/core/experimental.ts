import { getProductEnvironment } from "../product-environment.ts";

export function areExperimentalFeaturesEnabled(): boolean {
	return getProductEnvironment("EXPERIMENTAL") === "1";
}
