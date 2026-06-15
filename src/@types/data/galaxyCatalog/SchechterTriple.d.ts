/**
 * SchechterTriple — the three parameters of a Schechter luminosity
 * function `(M*, α, φ*)` for the band that defines a galaxy catalog's flux
 * limit.  Used by the Malmquist-bias correction's Schechter density
 * pathway and by `galaxyCatalogConstants(...)` to pre-compute the central-
 * density normaliser `nRef`.
 *
 * See the per-galaxy-catalog entries in `src/data/sources.ts` for the
 * literature-sourced values and the rationale per source.
 */
export type SchechterTriple = {
  /** Characteristic absolute magnitude M*. */
  mStar: number;
  /** Faint-end slope α. */
  alpha: number;
  /** Normalisation φ* in galaxies per Mpc³. */
  phiStar: number;
};
