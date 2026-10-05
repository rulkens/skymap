/**
 * hermiteTrackAt — cubic Hermite position (km) on a sampled track, from the
 * samples' positions and velocities. Evaluated in f64: positions reach 2.4e10 km
 * and the 1 km budget leaves no room for f32 anywhere on this path.
 * Past the last sample the craft is held at it; the caller guarantees
 * `tDays >= tDays[0]`.
 */

import type { SampledTrack } from '../../@types/scene/SampledTrack';
import type { Vec3 } from '../../@types/math/Vec3';

const SECONDS_PER_DAY = 86_400;

export function hermiteTrackAt(track: SampledTrack, tDays: number): Vec3 {
  const { tDays: ts, posKm, velKmS } = track;
  const last = ts.length - 1;
  if (tDays >= ts[last]!) return [posKm[3 * last]!, posKm[3 * last + 1]!, posKm[3 * last + 2]!];

  // Largest i with ts[i] <= tDays; the interval is [i, i + 1].
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ts[mid]! <= tDays) lo = mid;
    else hi = mid;
  }

  const spanDays = ts[lo + 1]! - ts[lo]!;
  const spanS = spanDays * SECONDS_PER_DAY;
  const s = (tDays - ts[lo]!) / spanDays;
  const s2 = s * s;
  const s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = s3 - 2 * s2 + s;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = s3 - s2;

  const out: Vec3 = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    out[k] =
      h00 * posKm[3 * lo + k]! +
      h10 * spanS * velKmS[3 * lo + k]! +
      h01 * posKm[3 * (lo + 1) + k]! +
      h11 * spanS * velKmS[3 * (lo + 1) + k]!;
  }
  return out;
}
