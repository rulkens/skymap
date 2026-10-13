/**
 * bodyVelocityKmS — a body's world velocity (km/s) at `simDays`, a ±60 s central difference of
 * `positionAt` (world Mpc). The Sun is a fixed anchor, so this is also its Sun-relative velocity,
 * the frame the sampled tracks' velocities live in.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import { SCALE_UNITS } from '../../data/scaleUnits';
import { SECONDS_PER_DAY } from '../../data/time/secondsPerDay';

const DIFF_HALF_STEP_S = 60;

export function bodyVelocityKmS(
  id: string,
  simDays: number,
  positionAt: (id: string, simDays: number) => Readonly<Vec3>,
): Vec3 {
  const halfDays = DIFF_HALF_STEP_S / SECONDS_PER_DAY;
  const before = positionAt(id, simDays - halfDays);
  const after = positionAt(id, simDays + halfDays);
  const scale = 1 / SCALE_UNITS.KM_TO_MPC / (2 * DIFF_HALF_STEP_S);
  return [
    (after[0] - before[0]) * scale,
    (after[1] - before[1]) * scale,
    (after[2] - before[2]) * scale,
  ];
}
