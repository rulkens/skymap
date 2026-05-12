/**
 * SchechterTriple — the three parameters of a Schechter luminosity
 * function `(M*, α, φ*)` for the band that defines a survey's flux
 * limit.  Used by the Malmquist-bias correction's Schechter density
 * pathway and by `surveyConstants(...)` to pre-compute the central-
 * density normaliser `nRef`.
 *
 * See `src/data/surveyFluxLimits.ts` for the literature-sourced values
 * and the per-survey rationale.
 */
export type SchechterTriple = {
  /** Characteristic absolute magnitude M*. */
  mStar: number;
  /** Faint-end slope α. */
  alpha: number;
  /** Normalisation φ* in galaxies per Mpc³. */
  phiStar: number;
};
