/**
 * satelliteLayerOpacity — the stale-data and camera-distance fade shared by the dots and the orbit
 * rings, so a ring never outlives its dot. 0 while no catalog is loaded.
 */
import { satelliteOpacity } from './satelliteOpacity';
import { julianDaysToUnixMs } from '../../../utils/time/julianDaysToUnixMs';
import { distanceMpc } from '../../../utils/math/distanceMpc';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import type { SatelliteCatalog } from '../../../@types/satellites/SatelliteCatalog';
import type { Vec3 } from '../../../@types/math/Vec3';

export function satelliteLayerOpacity(
  catalog: Pick<SatelliteCatalog, 'fetchedAtMs'> | null,
  simDays: number,
  eye: Readonly<Vec3>,
  earthMpc: Readonly<Vec3>,
): number {
  if (catalog === null) return 0;
  return satelliteOpacity(
    julianDaysToUnixMs(simDays),
    catalog.fetchedAtMs,
    distanceMpc(eye, earthMpc) / SCALE_UNITS.KM_TO_MPC,
  );
}
