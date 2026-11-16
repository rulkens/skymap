import type { LoadedSatelliteCatalog } from './LoadedSatelliteCatalog';
import type { SatelliteSweep } from './SatelliteSweep';

/**
 * SatellitePropagator — the main thread's handle on the SGP4 worker; at most one sweep in flight.
 */
export type SatellitePropagator = {
  start(file: ArrayBuffer): Promise<void>;
  stop(): void;
  catalog(): LoadedSatelliteCatalog | null;
  latest(): SatelliteSweep | null;
  request(simMs: number): void;
};
