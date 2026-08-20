/**
 * LonLatDeg — a geodetic point in degrees, matching the convention
 * `derivePlannerParams` builds `EarthTileBand`s in: east-positive longitude
 * in [-180, 180] (0 at the prime meridian), latitude in [-90, 90] (0 at the
 * equator). See `directionToLonLatDeg`'s header for the direction-vector
 * convention this is the inverse of.
 */
export type LonLatDeg = {
  readonly lonDeg: number;
  readonly latDeg: number;
};
