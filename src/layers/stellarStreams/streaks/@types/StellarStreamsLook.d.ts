/** One draw of the particle set: the sharp streak layer or the wide haze layer. */
export type StellarStreamsLook = {
  readonly intensity: number;
  readonly sizeScale: number;
  readonly stretch: number;
  readonly minPx: number;
  readonly flow: number;
};
