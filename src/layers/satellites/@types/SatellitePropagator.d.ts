import type { SatelliteCatalog } from '../../../@types/satellites/SatelliteCatalog';
import type { SatelliteSweep } from './SatelliteSweep';

/**
 * SatellitePropagator — the main thread's handle on the SGP4 worker. `request` is a no-op unless
 * the worker is ready and idle, so at most one sweep is ever in flight.
 */
export type SatellitePropagator = {
  /** Parses `satellites.satg`, spawns the worker and resolves once it has built every satrec. */
  start(file: ArrayBuffer): Promise<void>;
  /** Terminates the worker and drops the catalog and the last sweep. */
  stop(): void;
  catalog(): SatelliteCatalog | null;
  latest(): SatelliteSweep | null;
  request(simMs: number): void;
};
