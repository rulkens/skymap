/**
 * SchechterTriple — the three parameters of a Schechter luminosity
 * function `(M*, α, φ*)` for the band that defines a galaxy catalog's flux
 * limit. Used by the Malmquist-bias correction's Schechter density pathway.
 *
 * See the per-galaxy-catalog entries in the galaxyCatalog Layer's `sources/` rows for the
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
