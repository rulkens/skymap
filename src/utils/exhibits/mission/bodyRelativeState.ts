/**
 * bodyRelativeState — a craft minus another body (position km, velocity km/s) at `simDays`.
 * The craft's velocity is its track's own; the other body's is a central difference. Before
 * the track starts the craft is read at its first sample: the launch ascent is a fitted ease.
 */

import type { Vec3 } from '../../../@types/math/Vec3';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { trajectoryRegistry } from '../../../services/bodies/trajectoryRegistry';
import { hermiteTrackAt } from '../../orbit/hermiteTrackAt';
import { hermiteTrackVelAt } from '../../orbit/hermiteTrackVelAt';
import { bodyVelocityKmS } from '../../orbit/bodyVelocityKmS';
import { bodyPositionMpcAt } from './bodyPositionMpcAt';

/** The body's position relative to the Sun, km: the frame the sampled tracks live in. */
function sunRelativeKm(id: string, simDays: number): Vec3 {
  const p = bodyPositionMpcAt(id, simDays);
  const sun = bodyPositionMpcAt('sun', simDays);
  const inv = 1 / SCALE_UNITS.KM_TO_MPC;
  return [(p[0] - sun[0]) * inv, (p[1] - sun[1]) * inv, (p[2] - sun[2]) * inv];
}

export function bodyRelativeState(
  craftId: string,
  otherId: string,
  simDays: number,
): { rKm: Vec3; vKmS: Vec3 } | null {
  const track = trajectoryRegistry.get(craftId);
  if (track === undefined) return null;
  const t = Math.max(simDays, track.tDays[0]!);
  const craft = hermiteTrackAt(track, t);
  const craftV = hermiteTrackVelAt(track, t);
  const other = sunRelativeKm(otherId, t);
  const otherV = bodyVelocityKmS(otherId, t, bodyPositionMpcAt);
  return {
    rKm: [craft[0] - other[0], craft[1] - other[1], craft[2] - other[2]],
    vKmS: [craftV[0] - otherV[0], craftV[1] - otherV[1], craftV[2] - otherV[2]],
  };
}
