import type { GalaxyDescription } from '../../@types/galaxy/GalaxyDescription';

/**
 * `buildDisk` samples exp(-R/diskScaleLen) but then multiplies brightness by
 * diskFalloff(radius, 1.7) = exp(-R / (1.7 * diskScaleLen)). Light is what an
 * additive field integrates, so the mixture's scale length is the product's,
 * a factor 1/(1 + 1/1.7) shorter than the one stars are drawn at.
 */
const DISK_BRIGHTNESS_TAPER = 1.7;

/**
 * The light-weighted scale length `pushDisc` samples at — shared with
 * `pushArmRidges`' contrast law (needs the same Sigma_disc(R) the ridge is an
 * excess OVER) and with `dustDiscShape` (the dust disc's own scale length is
 * a ratio of this, not of the raw sampled `diskScaleLen`).
 */
export function discLightScaleLength(geometry: GalaxyDescription): number {
  return geometry.diskScaleLen / (1 + 1 / DISK_BRIGHTNESS_TAPER);
}
