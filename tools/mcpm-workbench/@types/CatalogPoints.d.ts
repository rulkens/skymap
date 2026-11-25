import type { GalaxyCatalogId } from '../../../src/layers/galaxyCatalog/@types/GalaxyCatalogId';

/**
 * CatalogPoints — flat positions + weights merged across one or more of
 * skymap's v9 galaxy catalog sources, for the MCPM sim to consume.
 */
export type CatalogPoints = {
  /** Interleaved xyz, Mpc, observer-centred equatorial-cartesian. */
  readonly positions: Float32Array;
  /** Linear, positive; stellar mass in 10¹² M☉ for built-in catalogs; NaN where absent. */
  readonly weight: Float32Array;
  readonly count: number;
  readonly sources: readonly GalaxyCatalogId[];
};
