/**
 * sfMapGasProfile — radial gas equilibrium: an exponential H2-like disc on
 * top of a flat gasFloor "HI" pedestal. Mirrors sfMapFluidStep.wesl's own
 * `gasProfile` function byte-for-formula (WGSL cannot import TS) — the two
 * MUST agree, or the CPU-side Kennicutt-Schmidt event weighting
 * (galaxySfMapFluidEvents.ts) disagrees with what the shader actually seeds
 * and relaxes gas toward.
 */
export function sfMapGasProfile(r: number, gasFloor: number, gasScaleLength: number): number {
  return gasFloor + (1 - gasFloor) * Math.exp(-r / gasScaleLength);
}
