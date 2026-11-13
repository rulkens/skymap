/** The Moon's crater table in the body's own axes (`moonCraterTable`), one entry per crater. */
export type MoonCraterTable = {
  readonly count: number;
  /** Unit centre vectors, xyz per crater. */
  readonly centres: Float32Array;
  /** Rim-crest radius, radians of arc. */
  readonly rho: Float32Array;
  /** Print weight 0..1; a rayed crater curated over 1 (`ANTIQUE_MOON_CRATER_WEIGHTS`). */
  readonly weight: Float32Array;
};
