import type { GalaxyCatalog } from '../data/GalaxyCatalog';
import type { Source } from '../../data/sources';

/** Inputs for a Schechter-ratio bake. */
export type ComputeSchechterRatiosInput = {
  /** Galaxy catalog whose galaxies need per-row Schechter ratios. */
  cloud: GalaxyCatalog;
  /** Survey this catalog belongs to — drives `mLim` and the Schechter triple. */
  source: Source;
};
