import type { COSMIC_WEB_DENSITY_SOURCE_ROWS } from '../sources/cosmicWebDensitySourceRows';

/** The asset rows this Layer authors: one density cube per source row, by its id. */
export type CosmicWebDensityAssetKey = (typeof COSMIC_WEB_DENSITY_SOURCE_ROWS)[number]['id'];
