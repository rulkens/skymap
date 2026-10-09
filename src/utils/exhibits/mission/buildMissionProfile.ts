/**
 * buildMissionProfile — the wall→sim table that plays a craft's mission from `fromDays` to
 * `endDays`. Each leg (stop to stop, the last to the end) takes `MISSION_LEG_WALL_MS` at 1×;
 * near a planet the sim speed is capped at `FRAME_CROSSINGS_PER_S` × frame diameter / the
 * craft's speed relative to it, so the frame never shrinks faster than the eye can follow, and
 * the speed grows at most e-fold per `MISSION_RAMP_MS`, so it never leaps leaving a cap.
 * Integrated in fixed wall steps, each landing exactly on a leg boundary it reaches.
 */

import type { MissionStop } from '../../../@types/missions/MissionStop';
import type { MissionProfile } from '../../../@types/time/MissionProfile';
import { FRAME_CROSSINGS_PER_S } from '../../../data/exhibits/mission/frameCrossingsPerS';
import { MISSION_LEG_WALL_MS } from '../../../data/exhibits/mission/missionLegWallMs';
import { MISSION_RAMP_MS } from '../../../data/exhibits/mission/missionRampMs';
import { MISSION_SPEEDS } from '../../../data/exhibits/mission/missionSpeeds';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { unixMsToJulianDays } from '../../time/unixMsToJulianDays';
import { bodyPositionMpcAt } from './bodyPositionMpcAt';
import { bodyRelativeState } from './bodyRelativeState';
import { missionFrame } from './missionFrame';

const SECONDS_PER_DAY = 86_400;
const STEP_MS = 50;
const RAMP = Math.exp(STEP_MS / MISSION_RAMP_MS);

/** Sim seconds per wall second the near-planet cap allows at `simDays`; Infinity in cruise. */
function capAt(stops: readonly MissionStop[], craftId: string, simDays: number): number {
  const frame = missionFrame(stops, craftId, simDays, (id) => bodyPositionMpcAt(id, simDays));
  if (frame === null) return Infinity;
  if (!frame.stop?.planetId) return Infinity;
  const rel = bodyRelativeState(craftId, frame.stop.planetId, simDays);
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
  let lastRate = Infinity;
  while (t < endDays) {
    while (leg + 2 < bounds.length && bounds[leg + 1]! <= t) leg++;
    const legEnd = Math.min(bounds[leg + 1]!, endDays);
    const legRate =
      ((bounds[leg + 1]! - bounds[leg]!) * SECONDS_PER_DAY) / (MISSION_LEG_WALL_MS / 1000);
    const rate = Math.min(factor * Math.min(legRate, capAt(stops, craftId, t)), lastRate * RAMP);
    lastRate = rate;
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
