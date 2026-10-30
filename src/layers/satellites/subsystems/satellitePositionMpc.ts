/**
 * satellitePositionMpc — where catalog object k is at `simDays`, in world Mpc: SGP4 on the main
 * thread at the exact instant, carried into the world the way the dots are (`composeTemeToWorld`),
 * so the camera follows the satellite rather than the dot's one-second extrapolation. km become
 * Mpc BEFORE Earth's heliocentric position joins in, or the offset would round off an au magnitude.
 */
import { sgp4 } from '../load/satelliteJsCore';
import { satrecOf } from '../load/satrecOf';
import { composeTemeToWorld } from './composeTemeToWorld';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { julianDaysToUnixMs } from '../../../utils/time/julianDaysToUnixMs';
import type { SatelliteCatalog } from '../../../@types/satellites/SatelliteCatalog';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { BodyState } from '../../../@types/scene/BodyState';

const MS_PER_MINUTE = 60_000;

export function satellitePositionMpc(
  cat: SatelliteCatalog,
  k: number,
  simDays: number,
  earth: BodyState,
): Vec3 | null {
  const state = sgp4(
    satrecOf(cat, k),
    (julianDaysToUnixMs(simDays) - cat.epochMs[k]!) / MS_PER_MINUTE,
  );
  if (state === null) return null;
  const { x, y, z } = state.position;
  const m = composeTemeToWorld(earth.orientation, simDays);
  const k2m = SCALE_UNITS.KM_TO_MPC;
  const e = earth.positionMpc;
  return [
    e[0] + (m[0] * x + m[3] * y + m[6] * z) * k2m,
    e[1] + (m[1] * x + m[4] * y + m[7] * z) * k2m,
    e[2] + (m[2] * x + m[5] * y + m[8] * z) * k2m,
  ];
}
