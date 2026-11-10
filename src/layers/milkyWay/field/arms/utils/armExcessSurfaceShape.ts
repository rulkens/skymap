import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';

/**
 * The arm excess's radial surface-brightness shape, exp(-(R - R_full) /
 * (hLight * scaleRatio)), normalised to 1 at `armFullRadius`. Read by both
 * arm tiers (`pushArmRidges` and `deriveArmCloudCount.ts`), leaving
 * `GalaxyArmCloudTuning.share` a grain knob on the residual. What
 * `scaleRatio` means physically: `GalaxyArmTuning.excessScaleRatio`.
 */
export function armExcessSurfaceShape(
  radius: number,
  geometry: GalaxyDescription,
  hLight: number,
  scaleRatio: number,
): number {
  return Math.exp(-(radius - geometry.armFullRadius) / (hLight * Math.max(scaleRatio, 1e-3)));
}
