/**
 * trailDrawsAt — which pieces of a craft's trail to draw at `simDays`. One trail shows at a
 * time: the Sun trail up to the craft, or, where `nearPlanets` asks and the craft is inside a
 * stay, that planet's piece up to the craft. The two are different pictures of the same
 * stretch (the planet moves), so they swap by a short cross-fade after the entry and after the
 * exit: the blend is additive, so the weights sum to one line. The planet's piece starts
 * loose at the reach boundary, so it fades to nothing toward that start.
 */

import { countAtOrBefore } from '../../../../utils/math/countAtOrBefore';
import { smoothstep } from '../../../../utils/math/smoothstep';
import type { CraftTrail } from '../@types/CraftTrail';
import type { MissionTrailGeometry } from '../@types/MissionTrailGeometry';
import type { NearTrail } from '../@types/NearTrail';
import type { TrailDraw } from '../@types/TrailDraw';
import { TRAIL_ENTRY_FADE_REACH, TRAIL_STAY_FADE } from '../data/missionTrailStyle';

function drawTo(piece: MissionTrailGeometry, t: number, weight: number, fadeMaxMpc = 0): TrailDraw {
  const k = countAtOrBefore(piece.tDays, t);
  // Past the last vertex the craft is held on it: no head segment to draw.
  const head = k < piece.tDays.length;
  return { piece, segmentCount: k - 1, head, weight, fadeMaxMpc };
}

/** The planet piece's share of the line: 0 at the entry, 1 mid-stay, 0 at the piece's end. */
function nearWeight({ piece, leaveDays }: NearTrail, opensTrack: boolean, t: number): number {
  const enterDays = piece.tDays[0]!;
  if (t > leaveDays) return 1 - smoothstep(leaveDays, piece.tDays[piece.tDays.length - 1]!, t);
  if (opensTrack) return 1;
  return smoothstep(enterDays, enterDays + TRAIL_STAY_FADE * (leaveDays - enterDays), t);
}

export function trailDrawsAt(
  trail: CraftTrail,
  simDays: number,
  nearPlanets: boolean,
): TrailDraw[] {
  const { whole, near } = trail;
  if (simDays < whole.tDays[0]!) return [];
  const stay = nearPlanets
    ? near.find(
        ({ piece }) => piece.tDays[0]! <= simDays && simDays < piece.tDays[piece.tDays.length - 1]!,
      )
    : undefined;
  if (stay === undefined) return [drawTo(whole, simDays, 1)];

  const { piece } = stay;
  // A stay that opens the track (the launch) has no Sun trail before it: no rise, no loose start.
  const opensTrack = piece.tDays[0]! <= whole.tDays[0]!;
  const w = nearWeight(stay, opensTrack, simDays);
  const fadeMaxMpc = opensTrack
    ? 0
    : TRAIL_ENTRY_FADE_REACH * Math.hypot(piece.relMpc[0]!, piece.relMpc[1]!, piece.relMpc[2]!);
  return [drawTo(whole, simDays, 1 - w), drawTo(piece, simDays, w, fadeMaxMpc)].filter(
    (d) => d.weight > 0,
  );
}
