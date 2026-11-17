/** One galaxy as the point interleave reads it; `derivePointRecord`'s input. */
export type GalaxyPointFields = {
  /** Position in Mpc. */
  x: number;
  y: number;
  z: number;
  /** Apparent magnitude in whichever band the catalog's `magG` holds; NaN allowed. */
  magnitude: number;
  axisRatio: number;
  positionAngleDeg: number;
  diameterKpc: number;
  orientationIsFallback: boolean;
  diameterIsFallback: boolean;
};
