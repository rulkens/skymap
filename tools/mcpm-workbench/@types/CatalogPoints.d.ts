import type { GalaxyCatalogId } from '../../../src/layers/galaxyCatalog/@types/GalaxyCatalogId';

/**
 * CatalogPoints — flat positions + masses merged across one or more of
 * skymap's v9 galaxy catalog sources, for the MCPM sim to consume.
 */
export type CatalogPoints = {
  /** Interleaved xyz, Mpc, observer-centred equatorial-cartesian. */
  readonly positions: Float32Array;
  /** Linear, positive weight (built-ins: stellar mass in 1e12 Msun), despite the name; NaN where absent. */
  readonly log10StellarMass: Float32Array;
  readonly count: number;
  readonly sources: readonly GalaxyCatalogId[];
};
