/**
 * missionFrame — the sphere the mission camera fits at `simDays`: the craft with the planet ahead
 * (the Sun when the next stop has none), handed over from the craft with the planet just passed
 * across days 1–30 after that encounter (centre linear, radius in log space). Evaluated exactly
 * per instant, never eased, so the craft cannot leave it: the blended radius is raised to the
 * craft's own distance from the blended centre, which a log-space blend alone can fall short of.
 */

import type { MissionFrame } from '../../../@types/missions/MissionFrame';
import type { MissionStop } from '../../../@types/missions/MissionStop';
import type { Vec3 } from '../../../@types/math/Vec3';
import { MISSION_FRAME_MARGIN } from '../../../data/exhibits/mission/missionFrameMargin';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { DAY_MS } from '../../../data/time/dayMs';
import { lerpVec3 } from '../../math/lerpVec3';
import { smoothstep } from '../../math/smoothstep';
import { julianDaysToUnixMs } from '../../time/julianDaysToUnixMs';
import { missionEventMs } from '../timeline/missionEventMs';

const HANDOFF_FROM_MS = 1 * DAY_MS;
const HANDOFF_TO_MS = 30 * DAY_MS;
/** Earth has no flyby distance; this keeps the opening frame close on it with the craft at its centre. */
const LAUNCH_FLOOR_KM = 20_000;

function floorMpc(stop: MissionStop): number {
  if (stop.encounter?.closestKm !== undefined)
    return 3 * stop.encounter.closestKm * SCALE_UNITS.KM_TO_MPC;
  return stop.planetId === 'earth' ? LAUNCH_FLOOR_KM * SCALE_UNITS.KM_TO_MPC : 0;
}

function pair(craft: Readonly<Vec3>, other: Readonly<Vec3>, floor: number) {
  const half = Math.hypot(craft[0] - other[0], craft[1] - other[1], craft[2] - other[2]) / 2;
  return {
    centre: lerpVec3(craft, other, 0.5),
    radius: Math.max(half * MISSION_FRAME_MARGIN, floor),
  };
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
  const ahead = stops[i + 1] ?? null;
  const behind = last?.planetId ? last : null;

  const craft = positionOf(craftId);
  const aheadPos = positionOf(ahead?.planetId ?? 'sun');
  const behindPos = behind ? positionOf(behind.planetId!) : undefined;
  if (craft === undefined || aheadPos === undefined || (behind && behindPos === undefined)) {
    return null;
  }

  const to = pair(craft, aheadPos, ahead ? floorMpc(ahead) : 0);
  let weight = 1;
  let sphere = to;
  if (behind) {
    const from = pair(craft, behindPos!, floorMpc(behind));
    const sinceMs = ms - (behind.encounter ? missionEventMs(behind.encounter) : behind.ms);
    weight = smoothstep(HANDOFF_FROM_MS, HANDOFF_TO_MS, sinceMs);
    sphere = {
      centre: lerpVec3(from.centre, to.centre, weight),
      radius: Math.exp(
        Math.log(from.radius) + (Math.log(to.radius) - Math.log(from.radius)) * weight,
      ),
    };
  }
  const { centre } = sphere;
  const reach = Math.hypot(craft[0] - centre[0], craft[1] - centre[1], craft[2] - centre[2]);
  return {
    aim: centre,
    radiusMpc: Math.max(sphere.radius, reach * MISSION_FRAME_MARGIN),
    behind,
    ahead,
    weight,
  };
}
