/**
 * decodeOrientationTexels — unpad + decode a mapped rgba16float readback
 * buffer into the (cos2theta, sin2theta) pairs `orientationTex` carries.
 *
 * rgba16float means 4 u16 lanes per texel even though only 2 are wanted;
 * .zw are dropped because orientationPresent.wesl only ever reads .xy.
 * The double-angle packing (not (cos theta, sin theta)) is what lets the
 * pair be interpolated across the pi wrap — a filament has no head/tail.
 */
import { f16ToFloat } from '../../../../../src/utils/math/f16ToFloat';

export function decodeOrientationTexels(
  padded: Uint16Array,
  paddedBytesPerRow: number,
  az: number,
  rings: number,
): Float32Array {
  const rowStrideU16 = paddedBytesPerRow / 2; // 2 bytes/u16
  const data = new Float32Array(az * rings * 2);
  for (let row = 0; row < rings; row++) {
    for (let a = 0; a < az; a++) {
      const src = row * rowStrideU16 + a * 4; // 4 u16 lanes/texel
      const dst = (row * az + a) * 2;
      data[dst] = f16ToFloat(padded[src]!);
      data[dst + 1] = f16ToFloat(padded[src + 1]!);
    }
  }
  return data;
}
