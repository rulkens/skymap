/**
 * flybyRelativeState — craft minus flyby target (position km, velocity km/s) at `simDays`.
 * The target is placed by the same `positionDriverById` rows `deriveBodyStates` walks, for this
 * one body only: the whole-scene derive is a one-deep cache a ride sampling hundreds of instants
 * would thrash. The target's velocity is a central difference; the craft's is the track's own.
 */

import type { MissionEvent } from '../../../@types/missions/MissionEvent';
import type { Vec3 } from '../../../@types/math/Vec3';
import { positionDriverById } from '../../../data/bodies/positionDrivers';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { trajectoryRegistry } from '../../../services/bodies/trajectoryRegistry';
import { hermiteTrackAt } from '../../orbit/hermiteTrackAt';
import { hermiteTrackVelAt } from '../../orbit/hermiteTrackVelAt';
import { orbitRowPlacement } from '../../orbit/orbitRowPlacement';

const SECONDS_PER_DAY = 86_400;
const DIFF_HALF_STEP_S = 60;

function placeMpc(id: string, simDays: number): Vec3 {
  const driver = positionDriverById(id);
  if (driver.kind === 'anchor') return driver.positionMpc;
  if (driver.kind === 'orbit') {
    return orbitRowPlacement(driver.elements, placeMpc(driver.elements.focusId, simDays), simDays)
      .positionMpc;
  }
  throw new Error(`flybyRelativeState: '${id}' is not an orbit or anchor body`);
}

/** The body's position relative to the Sun, km: the frame the sampled tracks live in. */
function sunRelativeKm(id: string, simDays: number): Vec3 {
  const p = placeMpc(id, simDays);
  const sun = placeMpc('sun', simDays);
  const inv = 1 / SCALE_UNITS.KM_TO_MPC;
  return [(p[0] - sun[0]) * inv, (p[1] - sun[1]) * inv, (p[2] - sun[2]) * inv];
}

export function flybyRelativeState(
  event: MissionEvent,
  simDays: number,
): { rKm: Vec3; vKmS: Vec3 } | null {
  const track = trajectoryRegistry.get(event.bodyId);
  if (track === undefined || event.targetId === undefined) return null;
  const halfDays = DIFF_HALF_STEP_S / SECONDS_PER_DAY;
  const craft = hermiteTrackAt(track, simDays);
  const craftV = hermiteTrackVelAt(track, simDays);
  const target = sunRelativeKm(event.targetId, simDays);
  const before = sunRelativeKm(event.targetId, simDays - halfDays);
  const after = sunRelativeKm(event.targetId, simDays + halfDays);
  const span = 2 * DIFF_HALF_STEP_S;
  return {
    rKm: [craft[0] - target[0], craft[1] - target[1], craft[2] - target[2]],
    vKmS: [
      craftV[0] - (after[0] - before[0]) / span,
      craftV[1] - (after[1] - before[1]) / span,
      craftV[2] - (after[2] - before[2]) / span,
    ],
  };
}
