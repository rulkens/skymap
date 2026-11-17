import type { GalaxyCatalog } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogId } from '../../../src/layers/galaxyCatalog/@types/GalaxyCatalogId';

/** Inputs for a Schechter-ratio bake. */
export type ComputeSchechterRatiosInput = {
  /** Galaxy catalog whose galaxies need per-row Schechter ratios. */
  cloud: GalaxyCatalog;
  /** Galaxy catalog this catalog belongs to — drives `mLim` and the Schechter triple. */
  source: GalaxyCatalogId;
};
