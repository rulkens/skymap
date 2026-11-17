/**
 * Floor on the radial tilt, and so a ceiling of 1/this on how much flux one
 * sprite can be handed relative to an outer one. The tilt suppresses inner
 * placements and the flux weight divides the same factor back out — exact
 * in expectation but unbounded in variance: at bias 3 an inner sprite
 * survives with probability ~0.007 and would then carry ~138x an outer
 * sprite's flux, reading as a bright knot inside the bulge. Applied to both
 * sides so the cancellation stays exact.
 */
const TILT_FLOOR = 0.05;

/**
 * The radial tilt at a radius — ONE definition, mirrored into
 * `placeArmCloud.wesl`'s own `cdpRadialTilt` (the placement acceptance and
 * the flux weight that cancels it both read the SAME formula there) and
 * re-derived here by `probeGpuErrors.ts` to verify the GPU's
 * flux-conservation output independently of the shader under test.
 */
export function radialTilt(radius: number, referenceRadius: number, bias: number): number {
  if (bias <= 0) return 1;
  return Math.max(TILT_FLOOR, (Math.max(radius, 0) / referenceRadius) ** bias);
}
