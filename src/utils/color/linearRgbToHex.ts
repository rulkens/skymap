/** Inverse of `hexToLinearRgb` — same transfer-function provenance. */

import type { Vec3 } from '../../@types/math/Vec3';
import type { HexString } from '../../@types/math/HexString';
import { linearRgbToDisplay } from './linearRgbToDisplay';

function channelToHex(c: number): string {
  return Math.round(c * 255)
    .toString(16)
    .padStart(2, '0');
}

export function linearRgbToHex(rgb: Readonly<Vec3>): HexString {
  const [r, g, b] = linearRgbToDisplay(rgb);
  return `#${channelToHex(r)}${channelToHex(g)}${channelToHex(b)}`;
}
