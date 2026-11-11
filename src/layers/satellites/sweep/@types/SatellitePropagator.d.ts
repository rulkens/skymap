import type { SatelliteCatalog } from '../../catalog/@types/SatelliteCatalog';
import type { SatelliteSweep } from './SatelliteSweep';

/**
 * SatellitePropagator — the main thread's handle on the SGP4 worker; at most one sweep in flight.
 */
export type SatellitePropagator = {
  start(file: ArrayBuffer): Promise<void>;
  stop(): void;
  catalog(): SatelliteCatalog | null;
  /** Each catalog object's profile code; null exactly when `catalog()` is. */
  profileCodes(): Uint8Array | null;
  latest(): SatelliteSweep | null;
  request(simMs: number): void;
};
