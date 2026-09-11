/**
 * scaleToUnitMax — scale an RGB colour so its largest channel hits 1 (a
 * uniform brightness lift). A black input `[0, 0, 0]` has no channel to scale
 * by, so it returns white rather than dividing by zero — a caption tinted
 * from this must never end up invisible.
 */

import type { Vec3 } from '../../@types/math/Vec3';

export function scaleToUnitMax(rgb: Readonly<Vec3>): Vec3 {
  const max = Math.max(rgb[0], rgb[1], rgb[2]);
  if (max <= 0) return [1, 1, 1];
  return [rgb[0] / max, rgb[1] / max, rgb[2] / max];
}
