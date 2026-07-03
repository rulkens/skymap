/**
 * speedRamp — map a normalised speed in [0,1] to a blue→red colour for the
 * debug clip-path inspector's speed-coloured polyline.
 *
 * Slow = cool blue, fast = hot red, with a green/yellow middle so neighbouring
 * speeds stay distinguishable. Red rises and blue falls monotonically, so
 * "redder = faster" reads unambiguously along the route. The returned vec4 is
 * premultiplied RGBA with alpha 1 (the marker-line renderer expects
 * premultiplied colour); at full alpha that is just the straight RGB.
 */

import type { Vec4 } from '../../@types/math/Vec4';

export function speedRamp(speed01: number): Vec4 {
  const x = speed01 < 0 ? 0 : speed01 > 1 ? 1 : speed01;
  // Slightly steepened so the ends saturate before the extremes, keeping the
  // mid-range vivid rather than washed-out grey.
  const r = Math.min(1, x * 1.6);
  const b = Math.min(1, (1 - x) * 1.6);
  const g = 1 - Math.abs(2 * x - 1); // tent: peaks green at the midpoint
  return [r, g, b, 1];
}
