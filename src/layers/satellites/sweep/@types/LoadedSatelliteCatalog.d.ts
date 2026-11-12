import type { SatelliteCatalog } from '../../catalog/@types/SatelliteCatalog';

/**
 * LoadedSatelliteCatalog — the parsed file plus the columns derived from it once at load, so a
 * derived column cannot outlive or precede the catalog it was derived from.
 */
export type LoadedSatelliteCatalog = SatelliteCatalog & {
  /** Each object's index into `SATELLITE_PROFILES`. */
  readonly profileCodes: Uint8Array;
};
