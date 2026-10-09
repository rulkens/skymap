/**
 * hermitePositionKm — cubic Hermite position at `tq` (UT days) on the segment between samples
 * `i` and `j` (`i < j`), from their positions (km) and velocities (km/s). Velocity is per
 * second, so the segment length is converted to seconds before it scales the tangents.
 */

const SECONDS_PER_DAY = 86_400;

export function hermitePositionKm(
  tDays: Float64Array,
  posKm: Float64Array,
  velKmS: Float32Array,
  i: number,
  j: number,
  tq: number,
): [number, number, number] {
  const spanDays = tDays[j]! - tDays[i]!;
  const u = (tq - tDays[i]!) / spanDays;
  const dtS = spanDays * SECONDS_PER_DAY;
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  const at = (axis: number): number =>
    h00 * posKm[3 * i + axis]! +
    h10 * dtS * velKmS[3 * i + axis]! +
    h01 * posKm[3 * j + axis]! +
    h11 * dtS * velKmS[3 * j + axis]!;
  return [at(0), at(1), at(2)];
}
