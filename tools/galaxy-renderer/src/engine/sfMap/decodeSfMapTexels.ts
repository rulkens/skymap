/**
 * decodeSfMapTexels — unpad + decode a mapped rgba16float readback buffer
 * from sfMapPack.wesl's packed output (gas, recentSf, oldActivity, dust)
 * into one tightly-packed `Float32Array`, 4 lanes per texel, row-major
 * (`ring*az + azIdx`) — the layout `GalaxySfMap.data` carries.
 *
 * Same f16-per-lane decode as `decodeOrientationTexels`, generalized to all
 * four channels: that helper drops `.zw` since orientation only ever wants
 * `.xy`, but this map's `dust` channel now lives in the slot `.zw` would
 * have dropped.
 */
import { f16ToFloat } from '../../../../../src/utils/math/f16ToFloat';

export function decodeSfMapTexels(
  padded: Uint16Array,
  paddedBytesPerRow: number,
  az: number,
  rings: number,
): Float32Array {
  const rowStrideU16 = paddedBytesPerRow / 2; // 2 bytes/u16
  const data = new Float32Array(az * rings * 4);
  for (let row = 0; row < rings; row++) {
    for (let a = 0; a < az; a++) {
      const src = row * rowStrideU16 + a * 4; // 4 u16 lanes/texel
      const dst = (row * az + a) * 4;
      data[dst] = f16ToFloat(padded[src]!);
      data[dst + 1] = f16ToFloat(padded[src + 1]!);
      data[dst + 2] = f16ToFloat(padded[src + 2]!);
      data[dst + 3] = f16ToFloat(padded[src + 3]!);
    }
  }
  return data;
}
