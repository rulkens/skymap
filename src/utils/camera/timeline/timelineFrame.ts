/**
 * timelineFrame — the sphere the timeline camera fits at `simDays`: the craft with the planet ahead
 * (the Sun when the next stop has none), or with the planet just passed until
 * `TIMELINE_FLYBY_LEAD_DAYS` after its closest approach; past the last stop, with its planet. The hand-off is a hard switch; the camera
 * driver eases across it in wall time, so the clock speed cannot rush it.
 */

import type { TimelineFrame } from '../../../@types/camera/timeline/TimelineFrame';
import type { TimelineStop } from '../../../@types/camera/timeline/TimelineStop';
import type { Vec3 } from '../../../../packages/shared/src/@types/math/Vec3';
import { TIMELINE_FLYBY_LEAD_DAYS } from '../../../data/exhibits/timeline/timelineFlybyLeadDays';
import { TIMELINE_FRAME_MARGIN } from '../../../data/camera/timeline/timelineFrameMargin';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { DAY_MS } from '../../../data/time/dayMs';
import { lerpVec3 } from '../../../../packages/shared/src/utils/math/lerpVec3';
import { julianDaysToUnixMs } from '../../time/julianDaysToUnixMs';
import { timelineEventMs } from '../../exhibits/timeline/timelineEventMs';

/** Earth has no flyby distance; this keeps the opening frame close on it with the craft at its centre. */
const LAUNCH_FLOOR_KM = 20_000;

function floorMpc(stop: TimelineStop): number {
  if (stop.encounter?.closestKm !== undefined)
    return 3 * stop.encounter.closestKm * SCALE_UNITS.KM_TO_MPC;
  return stop.planetId === 'earth' ? LAUNCH_FLOOR_KM * SCALE_UNITS.KM_TO_MPC : 0;
}

export function timelineFrame(
  stops: readonly TimelineStop[],
  craftId: string,
  simDays: number,
  positionOf: (id: string) => Readonly<Vec3> | undefined,
): TimelineFrame | null {
  const ms = julianDaysToUnixMs(simDays);
  let i = 0;
  while (i + 1 < stops.length && stops[i + 1]!.ms <= ms) i++;
  const last = stops[i];
  const passedMs = last?.encounter ? timelineEventMs(last.encounter) : (last?.ms ?? 0);
  const framed =
    last?.planetId && ms - passedMs < TIMELINE_FLYBY_LEAD_DAYS * DAY_MS
      ? last
      : (stops[i + 1] ?? last ?? null);
  const stop = framed?.planetId ? framed : null;

  const craft = positionOf(craftId);
  const other = positionOf(stop?.planetId ?? 'sun');
  if (craft === undefined || other === undefined) return null;
  const half = Math.hypot(craft[0] - other[0], craft[1] - other[1], craft[2] - other[2]) / 2;
  return {
    aim: lerpVec3(craft, other, 0.5),
    radiusMpc: Math.max(half * TIMELINE_FRAME_MARGIN, stop ? floorMpc(stop) : 0),
    stop,
  };
}
