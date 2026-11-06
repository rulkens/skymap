/**
 * Where the satellites are drawn. Distances are camera-to-Earth-centre in km. The catalog row
 * loads and releases at multiples of `goneBeyondKm` (`satellitesAssetRows`), so the file is
 * resident before the first point shows. GEO (42,164 km) is well inside the full-opacity radius.
 */
export const SATELLITE_FADES = {
  fullWithinKm: 300_000,
  goneBeyondKm: 600_000,
  /** Days from the data's fetch time: full inside, gone past the second (spec §5.3). */
  epochFullDays: 12,
  epochGoneDays: 14,
} as const;
