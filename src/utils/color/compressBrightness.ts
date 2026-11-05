/**
 * compressBrightness — raise an RGB colour's largest channel `m` to `m^gamma`,
 * scaling the others with it so the hue is kept. A `gamma` below 1 lifts dark
 * colours far more than bright ones while preserving their order — where
 * `scaleToUnitMax` would flatten them all to full brightness. Black has no hue
 * to keep, so it passes through unchanged.
 */

import type { Vec3 } from '../../@types/math/Vec3';

export function compressBrightness(rgb: Readonly<Vec3>, gamma: number): Vec3 {
  const max = Math.max(rgb[0], rgb[1], rgb[2]);
  if (max <= 0) return [0, 0, 0];
  const k = Math.pow(max, gamma - 1);
  return [rgb[0] * k, rgb[1] * k, rgb[2] * k];
}
