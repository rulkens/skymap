/**
 * How a `Label2DDirector` instance shapes the appear/disappear alpha ramp.
 * `smoothstepRamp` (COSMO) is a fixed-duration closed-form ease; `exponentialApproach`
 * (NEAR0, unimplemented until the mechanism-unification work lands its second arm)
 * is a decay-constant approach that settles within `settleEps` of its target.
 */
export type Label2DEnvelopePolicy =
  | { readonly mode: 'smoothstepRamp'; readonly durationMs: number }
  | { readonly mode: 'exponentialApproach'; readonly tauMs: number; readonly settleEps: number };
