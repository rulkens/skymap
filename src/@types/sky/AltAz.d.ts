/** Where a target stands in a spot's sky: compass azimuth (0 = north, π/2 = east) and altitude, radians. */
export type AltAz = {
  readonly azimuthRad: number;
  readonly altitudeRad: number;
};
