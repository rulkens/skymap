/**
 * linearRgbToHex — encode LINEAR RGB as a `#rrggbb` sRGB hex colour, for
 * feeding a native `<input type="color">` from a tuning value the shader
 * consumes as linear light. Inverse of `hexToLinearRgb`; see that file for
 * why sRGB (not a `pow(1/2.2)` approximation).
 *
 * Out-of-[0,1] channels (e.g. an intensity-boosted colour) clamp rather
 * than throw — the widget can only ever show a representable sRGB colour,
 * and clamping keeps the round trip total instead of crashing the panel.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import type { HexString } from '../../@types/math/HexString';

/** Apply the sRGB gamma transfer for one [0,1] channel → gamma-encoded. */
function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function channelToHex(c: number): string {
  const clamped = Math.min(1, Math.max(0, c));
  const byte = Math.round(linearToSrgb(clamped) * 255);
  return byte.toString(16).padStart(2, '0');
}

export function linearRgbToHex([r, g, b]: Readonly<Vec3>): HexString {
  return `#${channelToHex(r)}${channelToHex(g)}${channelToHex(b)}`;
}
