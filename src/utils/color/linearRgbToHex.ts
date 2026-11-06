/**
 * Inverse of `hexToLinearRgb` — same transfer-function provenance.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import type { HexString } from '../../@types/math/HexString';
import { linearToSrgbByte } from './linearToSrgbByte';

function channelToHex(c: number): string {
  return linearToSrgbByte(c).toString(16).padStart(2, '0');
}

export function linearRgbToHex([r, g, b]: Readonly<Vec3>): HexString {
  return `#${channelToHex(r)}${channelToHex(g)}${channelToHex(b)}`;
}
