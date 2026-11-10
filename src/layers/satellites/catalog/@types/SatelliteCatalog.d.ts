/**
 * SatelliteCatalog — every satellite's SGP4 mean elements, column by column (index k is one object
 * in every column), as `satellites.satg` stores them and the worker reads them. The element columns
 * keep CelesTrak's OMM units verbatim: SGP4 was fitted to them, so nothing is converted here.
 */
export type SatelliteCatalog = {
  /** Unix ms when the groups were downloaded; the ±14-day display window is centred on it. */
  readonly fetchedAtMs: number;
  readonly noradId: Uint32Array;
  /** Index into `SATELLITE_CLASSES`. */
  readonly classCode: Uint8Array;
  /** OMM `EPOCH` as Unix ms, sub-millisecond digits kept. */
  readonly epochMs: Float64Array;
  /** Revolutions per day. */
  readonly meanMotion: Float64Array;
  readonly eccentricity: Float64Array;
  /** Degrees, as are the next three. */
  readonly inclinationDeg: Float64Array;
  readonly raanDeg: Float64Array;
  readonly argPericenterDeg: Float64Array;
  readonly meanAnomalyDeg: Float64Array;
  /** Drag term, per Earth radius. */
  readonly bstar: Float64Array;
  /** Revolutions per day², and per day³: unused by SGP4 itself, carried so the OMM is whole. */
  readonly meanMotionDot: Float64Array;
  readonly meanMotionDdot: Float64Array;
  readonly names: readonly string[];
  /** COSPAR international designator (OMM `OBJECT_ID`), e.g. `1998-067A`. */
  readonly cosparIds: readonly string[];
};
