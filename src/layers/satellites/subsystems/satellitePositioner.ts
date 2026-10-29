/**
 * satellitePositioner — catalog object k as a `transientPositions` entry: SGP4 on the main thread
 * at the exact instant, carried into the world the way the dots are (`composeTemeToWorld`), so the
 * camera follows the satellite rather than the dot's one-second extrapolation. km become Mpc
 * BEFORE Earth's heliocentric position joins in, or the offset would round off an au magnitude.
 */
import { sgp4 } from '../load/satelliteJsCore';
import { satrecOf } from '../load/satrecOf';
import { composeTemeToWorld } from './composeTemeToWorld';
import { orientationForBody } from '../../../data/bodies/orientationForBody';
import { SCENE_EARTH } from '../../../data/bodies/sceneEarth';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { julianDaysToUnixMs } from '../../../utils/time/julianDaysToUnixMs';
import type { SatelliteCatalog } from '../../../@types/satellites/SatelliteCatalog';
import type { TransientPositioner } from '../../../@types/scene/TransientPositioner';

const MS_PER_MINUTE = 60_000;

export function satellitePositioner(cat: SatelliteCatalog, k: number): TransientPositioner {
  const rec = satrecOf(cat, k);
  const epochMs = cat.epochMs[k]!;
  return (simDays, positions) => {
    const earth = positions.get(SCENE_EARTH.id);
    if (earth === undefined) return null;
    const state = sgp4(rec, (julianDaysToUnixMs(simDays) - epochMs) / MS_PER_MINUTE);
    if (state === null) return null;
    const { x, y, z } = state.position;
    const m = composeTemeToWorld(orientationForBody(SCENE_EARTH.id, simDays, positions), simDays);
    const k2m = SCALE_UNITS.KM_TO_MPC;
    return [
      earth[0] + (m[0] * x + m[3] * y + m[6] * z) * k2m,
      earth[1] + (m[1] * x + m[4] * y + m[7] * z) * k2m,
      earth[2] + (m[2] * x + m[5] * y + m[8] * z) * k2m,
    ];
  };
}
