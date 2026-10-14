/**
 * missionFrame — the sphere the mission camera fits at `simDays`: the craft with the planet ahead
 * (the Sun when the next stop has none), or with the planet just passed until
 * `MISSION_FLYBY_LEAD_DAYS` after its closest approach. The hand-off is a hard switch; the camera
 * driver eases across it in wall time, so the clock speed cannot rush it.
 */

import type { MissionFrame } from '../../../@types/missions/MissionFrame';
import type { MissionStop } from '../../../@types/missions/MissionStop';
import type { Vec3 } from '../../../@types/math/Vec3';
import { MISSION_FLYBY_LEAD_DAYS } from '../../../data/exhibits/mission/missionFlybyLeadDays';
import { MISSION_FRAME_MARGIN } from '../../../data/exhibits/mission/missionFrameMargin';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { DAY_MS } from '../../../data/time/dayMs';
import { lerpVec3 } from '../../math/lerpVec3';
import { julianDaysToUnixMs } from '../../time/julianDaysToUnixMs';
import { missionEventMs } from '../timeline/missionEventMs';

/** Earth has no flyby distance; this keeps the opening frame close on it with the craft at its centre. */
const LAUNCH_FLOOR_KM = 20_000;

function floorMpc(stop: MissionStop): number {
  if (stop.encounter?.closestKm !== undefined)
    return 3 * stop.encounter.closestKm * SCALE_UNITS.KM_TO_MPC;
  return stop.planetId === 'earth' ? LAUNCH_FLOOR_KM * SCALE_UNITS.KM_TO_MPC : 0;
}

export function missionFrame(
  stops: readonly MissionStop[],
  craftId: string,
  simDays: number,
  positionOf: (id: string) => Readonly<Vec3> | undefined,
): MissionFrame | null {
  const ms = julianDaysToUnixMs(simDays);
  let i = 0;
  while (i + 1 < stops.length && stops[i + 1]!.ms <= ms) i++;
  const last = stops[i];
  const passedMs = last?.encounter ? missionEventMs(last.encounter) : (last?.ms ?? 0);
  const framed =
    last?.planetId && ms - passedMs < MISSION_FLYBY_LEAD_DAYS * DAY_MS
      ? last
      : (stops[i + 1] ?? null);
  const stop = framed?.planetId ? framed : null;

  const craft = positionOf(craftId);
  const other = positionOf(stop?.planetId ?? 'sun');
  if (craft === undefined || other === undefined) return null;
  const half = Math.hypot(craft[0] - other[0], craft[1] - other[1], craft[2] - other[2]) / 2;
  return {
    aim: lerpVec3(craft, other, 0.5),
    radiusMpc: Math.max(half * MISSION_FRAME_MARGIN, stop ? floorMpc(stop) : 0),
    stop,
  };
}
