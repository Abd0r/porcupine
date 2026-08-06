const PRODUCT_ENV_PREFIX = "PORCUPINE";
const LEGACY_ENV_PREFIX = "PI";

export function getProductEnvironment(name: string): string | undefined {
	return process.env[`${PRODUCT_ENV_PREFIX}_${name}`] ?? process.env[`${LEGACY_ENV_PREFIX}_${name}`];
}

export function hasProductEnvironment(name: string): boolean {
	return getProductEnvironment(name) !== undefined;
}

export function setProductEnvironment(name: string, value: string, mirrorLegacy = true): void {
	process.env[`${PRODUCT_ENV_PREFIX}_${name}`] = value;
	if (mirrorLegacy) process.env[`${LEGACY_ENV_PREFIX}_${name}`] = value;
}
