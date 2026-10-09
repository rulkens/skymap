/**
 * buildMissionProfile — the wall→sim table that plays a craft's mission from `fromDays` to
 * `endDays`. Each leg (stop to stop, the last to the end) takes `MISSION_LEG_WALL_MS` at 1×;
 * near a planet the sim speed is capped at `FRAME_CROSSINGS_PER_S` × frame diameter / the
 * craft's speed relative to it, so the frame never shrinks faster than the eye can follow.
 * Integrated in fixed wall steps, each landing exactly on a leg boundary it reaches.
 */

import type { MissionStop } from '../../../@types/missions/MissionStop';
import type { MissionProfile } from '../../../@types/time/MissionProfile';
import { MISSION_LEG_WALL_MS } from '../../../data/exhibits/mission/missionLegWallMs';
import { MISSION_SPEEDS } from '../../../data/exhibits/mission/missionSpeeds';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { unixMsToJulianDays } from '../../time/unixMsToJulianDays';
import { bodyPositionMpcAt } from './bodyPositionMpcAt';
import { bodyRelativeState } from './bodyRelativeState';
import { missionFrame } from './missionFrame';

const SECONDS_PER_DAY = 86_400;
/** At the cap the craft takes 1 / this many wall seconds to cross the frame. */
const FRAME_CROSSINGS_PER_S = 0.5;
const STEP_MS = 50;

/** Sim seconds per wall second the near-planet cap allows at `simDays`; Infinity in cruise. */
function capAt(stops: readonly MissionStop[], craftId: string, simDays: number): number {
  const frame = missionFrame(stops, craftId, simDays, (id) => bodyPositionMpcAt(id, simDays));
  if (frame === null) return Infinity;
  const near = frame.behind && frame.weight < 0.5 ? frame.behind : frame.ahead;
  if (!near?.planetId) return Infinity;
  const rel = bodyRelativeState(craftId, near.planetId, simDays);
  if (rel === null) return Infinity;
  const diameterKm = (2 * frame.radiusMpc) / SCALE_UNITS.KM_TO_MPC;
  return (FRAME_CROSSINGS_PER_S * diameterKm) / Math.hypot(...rel.vKmS);
}

export function buildMissionProfile(
  stops: readonly MissionStop[],
  craftId: string,
  fromDays: number,
  endDays: number,
  speedIndex: number,
  startWallMs: number,
): MissionProfile {
  const bounds = [...stops.map((s) => unixMsToJulianDays(s.ms)), endDays];
  const factor = MISSION_SPEEDS[speedIndex]!;
  let t = Math.max(fromDays, bounds[0]!);
  let wall = 0;
  const wallMs = [wall];
  const simDays = [t];
  let leg = 0;
  while (t < endDays) {
    while (leg + 2 < bounds.length && bounds[leg + 1]! <= t) leg++;
    const legEnd = Math.min(bounds[leg + 1]!, endDays);
    const legRate =
      ((bounds[leg + 1]! - bounds[leg]!) * SECONDS_PER_DAY) / (MISSION_LEG_WALL_MS / 1000);
    const rate = factor * Math.min(legRate, capAt(stops, craftId, t));
    const stepDays = (rate * STEP_MS) / 1000 / SECONDS_PER_DAY;
    if (t + stepDays >= legEnd) {
      wall += (((legEnd - t) * SECONDS_PER_DAY) / rate) * 1000;
      t = legEnd;
    } else {
      wall += STEP_MS;
      t += stepDays;
    }
    wallMs.push(wall);
    simDays.push(t);
  }
  return {
    startWallMs,
    wallMs: Float64Array.from(wallMs),
    simDays: Float64Array.from(simDays),
    speedIndex,
  };
}
