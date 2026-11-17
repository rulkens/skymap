import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../mixture/@types/GalaxyFieldTuning';

/**
 * Reid et al. 2019's maser-arm width law, re-expressed in units of the disc
 * scale length (h = 2.605 kpc for the MW) so it scales to any galaxy: w/h =
 * FLOOR_H + SLOPE*(R/h), i.e. w = FLOOR_H*h + SLOPE*R.
 */
const ARM_WIDTH_FLOOR_H = 0.017;

const ARM_WIDTH_SLOPE = 0.036;

/** This arm's cross-section sigma at a radius — same formula the blob placement's `sigmas.across` uses. */
export function armCrossSigma(
  radius: number,
  geometry: GalaxyDescription,
  tuning: GalaxyFieldTuning,
): number {
  return (
    (ARM_WIDTH_FLOOR_H * geometry.diskScaleLen + ARM_WIDTH_SLOPE * radius) * tuning.arms.widthScale
  );
}
