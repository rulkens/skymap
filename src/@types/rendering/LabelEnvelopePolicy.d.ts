/**
 * How a label director (`LabelDirectorRow`) shapes the appear/disappear alpha ramp.
 * `smoothstepRamp` (COSMO) is a fixed-duration closed-form ease; `exponentialApproach`
 * (NEAR0) is a decay-constant approach that settles within `settleEps` of its target.
 */
export type LabelEnvelopePolicy =
  | { readonly mode: 'smoothstepRamp'; readonly durationMs: number }
  | { readonly mode: 'exponentialApproach'; readonly tauMs: number; readonly settleEps: number };
