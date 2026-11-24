/**
 * trailStaysOf — the intervals in which a sampled craft is within each centre's reach.
 * Scanned at a fixed step, then each crossing is bisected to `CROSSING_TOLERANCE_DAYS`, so
 * a pass shorter than `SCAN_STEP_DAYS` can be missed. The craft's world position is the
 * Sun's plus the Sun-centred track, so nothing here assumes the Sun sits at the origin.
 */

import type { Vec3 } from '../../../../@types/math/Vec3';
import type { SampledTrack } from '../../../../@types/scene/SampledTrack';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { hermiteTrackAt } from '../../../../utils/orbit/hermiteTrackAt';
import type { TrailCentre } from '../@types/TrailCentre';
import type { TrailStay } from '../@types/TrailStay';

const SCAN_STEP_DAYS = 0.25;
const CROSSING_TOLERANCE_DAYS = 0.001;

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

  function insideReach(centre: TrailCentre, t: number): boolean {
    const sun = positionAt('sun', t);
    const craft = hermiteTrackAt(track, t);
    const body = positionAt(centre.id, t);
    let sq = 0;
    for (let k = 0; k < 3; k++) {
      const d = sun[k]! + craft[k]! * kmToMpc - body[k]!;
      sq += d * d;
    }
    const reachMpc = centre.reachKm * kmToMpc;
    return sq <= reachMpc * reachMpc;
  }

  // Bisects between a time outside the reach and one inside it; returns the inside end.
  function crossing(centre: TrailCentre, outside: number, inside: number): number {
    let out = outside;
    let inn = inside;
    while (Math.abs(inn - out) > CROSSING_TOLERANCE_DAYS) {
      const mid = 0.5 * (out + inn);
      if (insideReach(centre, mid)) inn = mid;
      else out = mid;
    }
    return inn;
  }

  const stays: TrailStay[] = [];
  const opened: (number | null)[] = centres.map((c) => (insideReach(c, first) ? first : null));
  let prev = first;
  while (prev < last) {
    const t = Math.min(prev + SCAN_STEP_DAYS, last);
    centres.forEach((centre, i) => {
      const inside = insideReach(centre, t);
      const start = opened[i]!;
      if (start === null && inside) {
        opened[i] = crossing(centre, prev, t);
      } else if (start !== null && !inside) {
        stays.push({ centreId: centre.id, t0Days: start, t1Days: crossing(centre, t, prev) });
        opened[i] = null;
      }
    });
    prev = t;
  }
  centres.forEach((centre, i) => {
    const start = opened[i]!;
    if (start !== null) stays.push({ centreId: centre.id, t0Days: start, t1Days: last });
  });
  return stays.sort((a, b) => a.t0Days - b.t0Days);
}
