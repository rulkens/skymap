/**
 * captionTint — a body's LINEAR colour (albedo, blackbody tint) as a legible
 * caption tint: display-encoded for the post-tone-map overlay, then mixed
 * toward white (never scaled — that clips and shifts hue) to clear a floor.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import { linearRgbToDisplay } from './linearRgbToDisplay';

/** Low end of the hand-authored label styles' 0.70–0.95 display-luminance band. */
const MIN_LUMINANCE = 0.65;

/** Rec. 709 relative luminance. */
function luminance([r, g, b]: Readonly<Vec3>): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function captionTint(linearRgb: Readonly<Vec3>): Vec3 {
  const c = linearRgbToDisplay(linearRgb);
  const lum = luminance(c);
  if (lum >= MIN_LUMINANCE) return c;
  // luminance(mix(c, white, t)) = lum·(1 − t) + t, so this t hits the floor exactly.
  const t = (MIN_LUMINANCE - lum) / (1 - lum);
  return [c[0] + (1 - c[0]) * t, c[1] + (1 - c[1]) * t, c[2] + (1 - c[2]) * t];
}
