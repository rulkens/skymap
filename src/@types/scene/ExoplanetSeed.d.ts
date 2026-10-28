/** One exoplanet as the NASA Exoplanet Archive publishes it (`pscomppars`), before any conversion. */
export type ExoplanetSeed = {
  readonly id: string; // 'trappist-1-e'
  readonly label: string; // 'TRAPPIST-1 e'
  /** A famous-star id: the host's anchor, and where its light comes from. */
  readonly hostId: string;
  readonly semiMajorAu: number; // pl_orbsmax
  readonly periodDays: number; // pl_orbper
  readonly eccentricity: number; // pl_orbeccen
  /** Tilt of the orbit to our sky, 90 = edge-on (pl_orbincl). */
  readonly inclinationDeg: number;
  /** Mid-transit time, BJD: the planet crosses in front of its star (pl_tranmid). */
  readonly transitJd: number;
  readonly radiusEarth: number; // pl_rade
};
