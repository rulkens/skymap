/**
 * hermiteSegmentKm — cubic Hermite position (km) at `tq` (UT days) on the segment between samples
 * `i` and `j` (`i < j`; non-adjacent for the build tool's decimator). Velocity is per second, so the
 * span is converted to seconds before it scales the tangents. The app and the decimator share it:
 * the decimation tolerance only holds if both evaluate the same curve.
 */

import type { Vec3 } from '../../@types/math/Vec3';

const SECONDS_PER_DAY = 86_400;

export function hermiteSegmentKm(
  tDays: Float64Array,
  posKm: Float64Array,
  velKmS: Float32Array,
  i: number,
  j: number,
  tq: number,
): Vec3 {
  const spanDays = tDays[j]! - tDays[i]!;
  const spanS = spanDays * SECONDS_PER_DAY;
  const s = (tq - tDays[i]!) / spanDays;
  const s2 = s * s;
  const s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = s3 - 2 * s2 + s;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = s3 - s2;

  const out: Vec3 = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    out[k] =
      h00 * posKm[3 * i + k]! +
      h10 * spanS * velKmS[3 * i + k]! +
      h01 * posKm[3 * j + k]! +
      h11 * spanS * velKmS[3 * j + k]!;
  }
  return out;
}
