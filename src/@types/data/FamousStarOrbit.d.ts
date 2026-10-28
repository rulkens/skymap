/**
 * A famous star's published visual-binary orbit around another famous star, in
 * the units and astrometric convention the orbit papers use (`SStarSeed`'s
 * fields): Ω a position angle North through East, epochs in Julian years.
 */
export type FamousStarOrbit = {
  /** The famous-star id it orbits: the focus, held fixed (a relative orbit). */
  readonly host: string;
  readonly semiMajorArcsec: number;
  readonly periodYr: number;
  readonly eccentricity: number;
  readonly inclinationDeg: number;
  readonly ascendingNodeDeg: number;
  readonly argPeriapsisDeg: number;
  readonly periapsisEpochYr: number;
};
