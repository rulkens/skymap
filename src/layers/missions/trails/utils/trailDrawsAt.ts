/**
 * trailDrawsAt — which pieces of a craft's trail to draw at `simDays`. In cruise it is the Sun
 * trail up to the craft. Inside a stay the Sun trail stops at the entry and the planet-centred
 * piece carries on to the craft; the two ends do not meet (the planet has moved on since the
 * entry), so both fade out toward the cut. Once the craft has left, the stay picture fades out
 * while the cruise picture fades in: the blend is additive, so the weights sum to one line.
 */

import { countAtOrBefore } from '../../../../utils/math/countAtOrBefore';
import { smoothstep } from '../../../../utils/math/smoothstep';
import type { CraftTrail } from '../@types/CraftTrail';
import type { MissionTrailGeometry } from '../@types/MissionTrailGeometry';
import type { TrailDraw } from '../@types/TrailDraw';
import { TRAIL_CUT_FADE_REACH } from '../data/missionTrailStyle';

const NO_FADE = -1;

function drawTo(
  piece: MissionTrailGeometry,
  t: number,
  headAllowed: boolean,
  weight: number,
): TrailDraw {
  const k = countAtOrBefore(piece.tDays, t);
  // Past the last vertex the craft is held on it: no head segment to draw.
  const head = headAllowed && k < piece.tDays.length;
  return {
    piece,
    segmentCount: Math.max(k - 1, 0),
    head,
    weight,
    fadeVertex: NO_FADE,
    fadeMaxMpc: 0,
  };
}

export function trailDrawsAt(trail: CraftTrail, simDays: number): TrailDraw[] {
  const { whole, near } = trail;
  if (simDays < whole.tDays[0]!) return [];
  const stay = near.find(
    ({ piece }) => piece.tDays[0]! <= simDays && simDays < piece.tDays[piece.tDays.length - 1]!,
  );
  const draws: TrailDraw[] = [];
  if (stay === undefined) {
    draws.push(drawTo(whole, simDays, true, 1));
  } else {
    const { piece, leaveDays } = stay;
    const enterDays = piece.tDays[0]!;
    const cruise = smoothstep(leaveDays, piece.tDays[piece.tDays.length - 1]!, simDays);
    // A stay that opens the track (the launch) has no Sun trail before it, so nothing to fade.
    const cut = enterDays > whole.tDays[0]!;
    const fadeMaxMpc = cut
      ? TRAIL_CUT_FADE_REACH * Math.hypot(piece.relMpc[0]!, piece.relMpc[1]!, piece.relMpc[2]!)
      : 0;
    const before = drawTo(whole, enterDays, false, 1 - cruise);
    draws.push(
      { ...before, fadeVertex: before.segmentCount, fadeMaxMpc },
      { ...drawTo(piece, simDays, true, 1 - cruise), fadeVertex: cut ? 0 : NO_FADE, fadeMaxMpc },
      drawTo(whole, simDays, true, cruise),
    );
  }
  return draws.filter((d) => d.weight > 0 && (d.segmentCount > 0 || d.head));
}
