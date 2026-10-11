/**
 * SampledTrack — a spacecraft trajectory as dense ephemeris samples, for craft
 * with no orbital elements. `tDays` is a UT Julian date, the unit of
 * `deriveBodyStates(simDays)`, never TDB.
 */

export type SampledTrack = {
  readonly id: string;
  readonly tDays: Float64Array; // ascending, n samples
  readonly posKm: Float64Array; // 3n, Sun-centred, equatorial (ICRF)
  readonly velKmS: Float32Array; // 3n
};
