/**
 * trailDrawsAt — which pieces of a craft's trail to draw at `simDays`. Inside a stay the Sun
 * trail stops at the last vertex at or before the entry instant (a gap of at most one chord)
 * and the planet-centred piece carries on to the craft; otherwise the Sun trail runs to it.
 */

import { countAtOrBefore } from '../../../../utils/math/countAtOrBefore';
import type { CraftTrail } from '../@types/CraftTrail';
import type { MissionTrailGeometry } from '../@types/MissionTrailGeometry';
import type { TrailDraw } from '../@types/TrailDraw';

function drawTo(piece: MissionTrailGeometry, t: number, headAllowed: boolean): TrailDraw {
  const k = countAtOrBefore(piece.tDays, t);
  // Past the last vertex the craft is held on it: no head segment to draw.
  return { piece, segmentCount: Math.max(k - 1, 0), head: headAllowed && k < piece.tDays.length };
}

export function trailDrawsAt(trail: CraftTrail, simDays: number): TrailDraw[] {
  const { whole, near } = trail;
  if (simDays < whole.tDays[0]!) return [];
  const stay = near.find((p) => p.tDays[0]! <= simDays && simDays < p.tDays[p.tDays.length - 1]!);
  const draws =
    stay === undefined
      ? [drawTo(whole, simDays, true)]
      : [drawTo(whole, stay.tDays[0]!, false), drawTo(stay, simDays, true)];
  return draws.filter((d) => d.segmentCount > 0 || d.head);
}
