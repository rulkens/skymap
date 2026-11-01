/**
 * Where the satellites are drawn and loaded. Distances are camera-to-Earth-centre in km. The load
 * radius sits outside the fade-in so the file and the worker are resident before the first point
 * shows; release sits further out still, so hovering at the edge does not thrash (spec §5.5).
 * GEO (42,164 km) is well inside the full-opacity radius.
 */
export const SATELLITE_FADES = {
  fullWithinKm: 300_000,
  goneBeyondKm: 600_000,
  loadWithinKm: 900_000,
  releaseBeyondKm: 1_500_000,
  /** Days from the data's fetch time: full inside, gone past the second (spec §5.3). */
  epochFullDays: 12,
  epochGoneDays: 14,
} as const;
