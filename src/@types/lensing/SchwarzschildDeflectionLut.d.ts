/**
 * Schwarzschild bending angle by impact parameter (units r_s): `samples[i]`
 * is the angle at the grid point linearly spaced between `minImpactParamRs`
 * and `maxImpactParamRs`. At or below the critical impact parameter (photon
 * sphere), the ray is captured — sample is `Infinity`.
 */
export type SchwarzschildDeflectionLut = {
  readonly samples: Float32Array; // total bending angle, radians, indexed by impact parameter
  readonly minImpactParamRs: number; // in units of r_s
  readonly maxImpactParamRs: number;
};
