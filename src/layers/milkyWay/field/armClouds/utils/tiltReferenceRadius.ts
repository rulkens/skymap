import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';

/**
 * Reference radius for the radial tilt: the outermost arm's own fade
 * radius, so `(radius / this) ** bias` never exceeds 1 anywhere a complex
 * can be proposed — a weight above 1 would silently flatten the sampler's
 * rejection test into a uniform tail instead of erroring.
 *
 * One reference across all arms, not each arm's own fadeRadius, so the tilt
 * can't redistribute light between arms of different lengths. Packed by
 * `createIsmMapPlaceArmCloud.ts` into `placeArmCloud.wesl`'s own uniforms
 * (`tiltRefRadius`) and re-derived by `probeGpuErrors.ts` to verify the
 * GPU's flux-conservation output independently.
 */
export function tiltReferenceRadius(geometry: GalaxyDescription): number {
  let max = 0;
  for (const arm of geometry.arms) max = Math.max(max, arm.fadeRadius);
  return max > 0 ? max : geometry.armStartRadius;
}
