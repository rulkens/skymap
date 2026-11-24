/**
 * trailStaysOf — the intervals in which a sampled craft is within each centre's reach.
 * Each centre is walked on its own clock: the step is the time the craft could not cross the
 * gap to the reach boundary in (floored at `MIN_STEP_DAYS`), so far-off stretches cost almost
 * nothing. Each crossing is then bisected to `CROSSING_TOLERANCE_DAYS`. A pass shorter than
 * `MIN_STEP_DAYS` can be missed. The craft's world position is the Sun's plus the Sun-centred
 * track, so nothing here assumes the Sun sits at the origin.
 */

import type { Vec3 } from '../../../../@types/math/Vec3';
import type { SampledTrack } from '../../../../@types/scene/SampledTrack';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { SECONDS_PER_DAY } from '../../../../data/time/secondsPerDay';
import { hermiteTrackAt } from '../../../../utils/orbit/hermiteTrackAt';
import type { TrailCentre } from '../@types/TrailCentre';
import type { TrailStay } from '../@types/TrailStay';

const MIN_STEP_DAYS = 0.25;
const CROSSING_TOLERANCE_DAYS = 0.001;
// Craft heliocentric speed plus the fastest planet, bounded generously: the fastest closing speed.
const V_MAX_KM_S = 100;

export function trailStaysOf(
  track: SampledTrack,
  centres: readonly TrailCentre[],
  positionAt: (id: string, simDays: number) => Readonly<Vec3>,
): TrailStay[] {
  const n = track.tDays.length;
  if (n === 0) return [];
  const first = track.tDays[0]!;
  const last = track.tDays[n - 1]!;
  const kmToMpc = SCALE_UNITS.KM_TO_MPC;
  const kmPerDay = V_MAX_KM_S * SECONDS_PER_DAY;

  function distanceKm(centre: TrailCentre, t: number): number {
    const sun = positionAt('sun', t);
    const craft = hermiteTrackAt(track, t);
    const body = positionAt(centre.id, t);
    let sq = 0;
    for (let k = 0; k < 3; k++) {
      const d = sun[k]! + craft[k]! * kmToMpc - body[k]!;
      sq += d * d;
    }
    return Math.sqrt(sq) / kmToMpc;
  }

  // Bisects between a time outside the reach and one inside it; returns the inside end.
  function crossing(centre: TrailCentre, outside: number, inside: number): number {
    let out = outside;
    let inn = inside;
    while (Math.abs(inn - out) > CROSSING_TOLERANCE_DAYS) {
      const mid = 0.5 * (out + inn);
      if (distanceKm(centre, mid) <= centre.reachKm) inn = mid;
      else out = mid;
    }
    return inn;
  }

  const stays: TrailStay[] = [];
  for (const centre of centres) {
    let t = first;
    let d = distanceKm(centre, t);
    let start: number | null = d <= centre.reachKm ? first : null;
    while (t < last) {
      const next = Math.min(
        t + Math.max(MIN_STEP_DAYS, Math.abs(d - centre.reachKm) / kmPerDay),
        last,
      );
      const nextD = distanceKm(centre, next);
      const inside = nextD <= centre.reachKm;
      if (start === null && inside) {
        start = crossing(centre, t, next);
      } else if (start !== null && !inside) {
        stays.push({ centreId: centre.id, t0Days: start, t1Days: crossing(centre, next, t) });
        start = null;
      }
      t = next;
      d = nextD;
    }
    if (start !== null) stays.push({ centreId: centre.id, t0Days: start, t1Days: last });
  }
  return stays.sort((a, b) => a.t0Days - b.t0Days);
}
