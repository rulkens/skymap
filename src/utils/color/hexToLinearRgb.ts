/**
 * hexToLinearRgb — parse a `#RRGGBB` hex colour (as produced by a native
 * `<input type="color">`, which always speaks sRGB) into LINEAR RGB.
 *
 * Pairs with `linearRgbToHex` for tuning knobs that store LINEAR RGB (fed
 * straight into an HDR additive shader) but are edited through a widget
 * that only understands sRGB hex — see `ZoneOfAvoidanceTuningSection`.
 *
 * Uses the proper piecewise sRGB transfer function (a linear segment near
 * black, then a 2.4 power curve), not a `pow(2.2)` approximation — the
 * difference is visible at low intensities, which is exactly where this
 * layer's tuning lives.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import type { HexString } from '../../@types/math/HexString';

/** Undo the sRGB gamma transfer for one [0,1] channel → linear light. */
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function hexToLinearRgb(hex: HexString): Vec3 {
  if (hex.length !== 7) {
    throw new Error(`hexToLinearRgb: expected #RRGGBB, got ${hex} (length ${hex.length})`);
  }
  const body = hex.slice(1);
  if (!/^[0-9a-fA-F]+$/.test(body)) {
    throw new Error(`hexToLinearRgb: non-hex character in ${hex}`);
  }
  const r = parseInt(body.slice(0, 2), 16) / 255;
  const g = parseInt(body.slice(2, 4), 16) / 255;
  const b = parseInt(body.slice(4, 6), 16) / 255;
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}
