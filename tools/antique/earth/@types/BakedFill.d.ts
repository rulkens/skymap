/** Realm ground as triangles on the unit globe: xyz per vertex, a colour code per
 * vertex (0 none, 1..7 pigment + 1), and u32 triangle indices. */
export type BakedFill = {
  readonly positions: Float32Array;
  readonly codes: Uint8Array;
  readonly indices: Uint32Array;
};
