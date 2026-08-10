/**
 * stretchExtinctionChroma — `rgb' = g + redness * (rgb - g)` about the GREEN
 * channel (untouched, the identity anchor). See `GalaxyDustParams.redness`
 * for the physical rationale.
 */
import type { Vec3 } from '../../@types/math/Vec3';

export function stretchExtinctionChroma(rgb: Vec3, redness: number): Vec3 {
  const g = rgb[1];
  // Clamps at 0: extreme redness on a far-from-green channel can otherwise
  // drive this negative.
  return [Math.max(0, g + redness * (rgb[0] - g)), g, Math.max(0, g + redness * (rgb[2] - g))];
}
