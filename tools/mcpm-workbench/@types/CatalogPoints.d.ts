import type { SourceType } from '../../../src/@types/data/SourceType';

/**
 * CatalogPoints — flat positions + masses merged across one or more of
 * skymap's v9 galaxy catalog sources, for the MCPM sim to consume.
 */
export type CatalogPoints = {
  /** Interleaved xyz, Mpc, observer-centred equatorial-cartesian. */
  readonly positions: Float32Array;
  readonly log10StellarMass: Float32Array; // NaN where absent
  readonly count: number;
  readonly sources: readonly SourceType[];
};
