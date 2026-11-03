/**
 * limbDarkeningParams: per-body Minnaert limb-darkening constants folded onto the
 * textured-body Lambert term. A body absent from the table gets `strength 0`
 * (identity); adding a row is the whole gate. `strength` in [0,1] lerps Lambert to
 * the Minnaert law `I/F = mu0^k * mu^(k-1)`; `exponent` is `k` (1.0 = Lambert).
 * Gas and ice giants get strong values, Venus a milder one, airless bodies none.
 * Eye-tuned via HMR, so deliberately untested beyond key resolution.
 */

export const LIMB_DARKENING_PARAMS: Readonly<
  Record<string, { strength: number; exponent: number }>
> = {
  venus: { strength: 0.25, exponent: 1.15 },
  jupiter: { strength: 0.6, exponent: 1.3 },
  saturn: { strength: 0.55, exponent: 1.3 },
  uranus: { strength: 0.45, exponent: 1.25 },
  neptune: { strength: 0.45, exponent: 1.25 },
};
