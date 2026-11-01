/** `derivePointRecord`'s output: slots 3, 5, 6-7, 8, 10 and 11 of the point interleave. */
export type GalaxyPointDerived = {
  magnitude: number;
  /** Sign bit = orientation fallback. */
  axisRatio: number;
  paCos: number;
  paSin: number;
  /** Sign bit = diameter fallback. */
  radiusMpc: number;
  absMag: number;
  sbAmp: number;
};
