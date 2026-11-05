/**
 * hermiteTrackAt — cubic Hermite position (km) on a sampled track, from the
 * samples' positions and velocities. Evaluated in f64: positions reach 2.4e10 km
 * and the 1 km budget leaves no room for f32 anywhere on this path.
 * Past the last sample the craft is held at it; the caller guarantees
 * `tDays >= tDays[0]`.
 */

import type { SampledTrack } from '../../@types/scene/SampledTrack';
import type { Vec3 } from '../../@types/math/Vec3';
import { countAtOrBefore } from '../math/countAtOrBefore';
import { hermiteSegmentKm } from './hermiteSegmentKm';

export function hermiteTrackAt(track: SampledTrack, tDays: number): Vec3 {
  const { tDays: ts, posKm, velKmS } = track;
  const last = ts.length - 1;
  if (tDays >= ts[last]!) return [posKm[3 * last]!, posKm[3 * last + 1]!, posKm[3 * last + 2]!];
  const lo = countAtOrBefore(ts, tDays) - 1;
  return hermiteSegmentKm(ts, posKm, velKmS, lo, lo + 1, tDays);
}
