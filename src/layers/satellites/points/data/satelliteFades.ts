/**
 * Where the satellites are drawn. Distances are camera-to-Earth-centre in km. The catalog row
 * loads and releases at multiples of `goneBeyondKm` (`satellitesAssetRows`), so the file is
 * resident before the first point shows. GEO (42,164 km) is well inside the full-opacity radius.
 */
export const SATELLITE_FADES = {
  fullWithinKm: 300_000,
  goneBeyondKm: 600_000,
  /**
   * Days before the data's fetch time: full inside, gone past the second. Only the past fades:
   * earlier than the fetch, the catalog holds objects not yet launched. Later, positions only
   * drift, and the detail card says so instead.
   */
  pastFullDays: 12,
  pastGoneDays: 14,
} as const;
