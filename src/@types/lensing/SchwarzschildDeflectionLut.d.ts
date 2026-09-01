/**
 * Output of `buildSchwarzschildDeflectionLut` — total light-bending angle
 * as a function of impact parameter, for the Sgr A* lensing pass's O(1)
 * per-pixel lookup. `samples[i]` is the angle for the impact parameter at
 * grid index i, linearly spaced between `minImpactParamRs` and
 * `maxImpactParamRs`. A ray with impact parameter at or below the photon
 * sphere's critical value (3√3/2 · r_s) is captured; its sample is
 * `Infinity`, the sentinel the consuming pass tests for.
 */
export type SchwarzschildDeflectionLut = {
  readonly samples: Float32Array; // total bending angle, radians, indexed by impact parameter
  readonly minImpactParamRs: number; // in units of r_s
  readonly maxImpactParamRs: number;
};
