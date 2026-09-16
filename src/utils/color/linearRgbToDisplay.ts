/**
 * linearRgbToDisplay — sRGB-encode a LINEAR RGB triplet. Marker lines and
 * labels draw onto the swap chain AFTER the tone-map's own gamma encode
 * (`frameOrder`'s overlay group), so they read what they are handed as a
 * DISPLAY value and a physical linear tint paints far too dark uncrossed.
 */

import type { Vec3 } from '../../@types/math/Vec3';

/** Apply the sRGB gamma transfer for one [0,1] channel → gamma-encoded. */
function linearToSrgb(c: number): number {
  const clamped = Math.min(1, Math.max(0, c));
  return clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
}

export function linearRgbToDisplay([r, g, b]: Readonly<Vec3>): Vec3 {
  return [linearToSrgb(r), linearToSrgb(g), linearToSrgb(b)];
}
