/** The contact decal's unit cube to clip and back, f64 — `composeContactDecalMatrices`. */
export type ContactDecalMatrices = {
  readonly boxToClip: Float64Array;
  readonly clipToBox: Float64Array;
};
