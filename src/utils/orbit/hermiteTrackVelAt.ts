/**
 * hermiteTrackVelAt — the derivative of the cubic Hermite `hermiteTrackAt` evaluates, in km/s.
 * The same basis differentiated, so position and velocity agree exactly at every node; past the
 * last sample the craft is held, so its velocity is the last sample's.
 */

import type { SampledTrack } from '../../@types/scene/SampledTrack';
import type { Vec3 } from '../../@types/math/Vec3';

const SECONDS_PER_DAY = 86_400;

export function hermiteTrackVelAt(track: SampledTrack, tDays: number): Vec3 {
  const { tDays: ts, posKm, velKmS } = track;
  const last = ts.length - 1;
  if (tDays >= ts[last]!) return [velKmS[3 * last]!, velKmS[3 * last + 1]!, velKmS[3 * last + 2]!];

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
  const d00 = 6 * s2 - 6 * s;
  const d10 = 3 * s2 - 4 * s + 1;
  const d01 = -d00;
  const d11 = 3 * s2 - 2 * s;

  const out: Vec3 = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    out[k] =
      (d00 * posKm[3 * lo + k]! + d01 * posKm[3 * (lo + 1) + k]!) / spanS +
      d10 * velKmS[3 * lo + k]! +
      d11 * velKmS[3 * (lo + 1) + k]!;
  }
  return out;
}
