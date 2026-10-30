/**
 * satelliteLayerOpacity — the stale-data fade shared by the dots and the orbit rings. Not the
 * sweep-lag fade: at fast time the dots fade because sweeps cannot keep up, while a selected ring
 * is SGP4'd every frame and stays exact. 0 while no catalog is loaded.
 */
import { satelliteOpacity } from './satelliteOpacity';
import { julianDaysToUnixMs } from '../../../utils/time/julianDaysToUnixMs';
import type { SatelliteCatalog } from '../../../@types/satellites/SatelliteCatalog';

export function satelliteLayerOpacity(
  catalog: Pick<SatelliteCatalog, 'fetchedAtMs'> | null,
  simDays: number,
): number {
  if (catalog === null) return 0;
  return satelliteOpacity(julianDaysToUnixMs(simDays), catalog.fetchedAtMs);
}
