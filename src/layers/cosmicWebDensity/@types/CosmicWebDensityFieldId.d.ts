import type { COSMIC_WEB_DENSITY_SOURCE_ROWS } from '../sources/cosmicWebDensitySourceRows';

/**
 * CosmicWebDensityFieldId — the closed set of scalar-volume identifiers the
 * renderer accepts. Follows the Layer's own rows tuple, so adding a volume
 * entry widens the union automatically.
 */
export type CosmicWebDensityFieldId = (typeof COSMIC_WEB_DENSITY_SOURCE_ROWS)[number]['id'];
