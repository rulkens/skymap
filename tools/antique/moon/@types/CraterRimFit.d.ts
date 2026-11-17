/** One crater's rim as the LOLA DEM shows it (`fitCraterRim`). */
export type CraterRimFit = {
  /** Median crest radius, radians of arc. */
  readonly rhoRad: number;
  /** Mean crest height minus floor height, km. */
  readonly depthKm: number;
  /** Share of the radial profiles whose maximum is a real crest, not the search edge. */
  readonly confidence: number;
};
