/**
 * packRgba8Unorm — an RGBA colour in [0, 1] as one u32, the inverse of WGSL's
 * `unpack4x8unorm` (red in the low byte). Out-of-range channels clamp.
 */

import type { Vec4 } from '../../@types/math/Vec4';

export function packRgba8Unorm(color: Readonly<Vec4>): number {
  let word = 0;
  for (let i = 3; i >= 0; i--) {
    word = word * 256 + Math.round(Math.min(Math.max(color[i]!, 0), 1) * 255);
  }
  return word;
}
