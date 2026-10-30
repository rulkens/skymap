/**
 * satellitePositionMpc — where catalog object k is at `simDays`, in world Mpc: SGP4 on the main
 * thread at the exact instant, carried into the world the way the dots are (`composeTemeToWorld`),
 * so the camera follows the satellite rather than the dot's one-second extrapolation.
 */
import { sgp4 } from '../load/satelliteJsCore';
import { satrecOf } from '../load/satrecOf';
import { composeTemeToWorld } from './composeTemeToWorld';
import { temeKmToWorldMpc } from './temeKmToWorldMpc';
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
  return temeKmToWorldMpc(m, [x, y, z], earth.positionMpc);
}
