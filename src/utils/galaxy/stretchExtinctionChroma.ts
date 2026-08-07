/**
 * stretchExtinctionChroma — exaggerates (or flattens) a CCM89 extinction
 * ratio's chromaticity about its own GREEN channel, per `GalaxyDustParams`'
 * `redness` field: `rgb' = g + redness * (rgb - g)`, so green (and total
 * dimming at the anchor) is untouched, 1 is the identity, and >1 stretches
 * the blue/red spread past CCM89's physical budget.
 */
import type { Vec3 } from '../../@types/math/Vec3';

export function stretchExtinctionChroma(rgb: Vec3, redness: number): Vec3 {
  const g = rgb[1];
  // Extreme `redness` on an already-far-from-green channel can drive
  // `g + redness * (rgb - g)` negative — clamp at 0 so it never mints a
  // negative optical depth.
  return [Math.max(0, g + redness * (rgb[0] - g)), g, Math.max(0, g + redness * (rgb[2] - g))];
}
