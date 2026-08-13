/**
 * Inverse of `hexToLinearRgb` — same transfer-function provenance.
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
