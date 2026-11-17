/**
 * The decoded antique Earth map (`decodeAntiqueEarthMap`): byte views straight
 * into the fetched file, uploaded to the GPU as they are. Line level ends count
 * line VERTICES, the bake having sorted its strips by reveal level.
 */
export type AntiqueEarthMap = {
  readonly fillVertices: Uint8Array;
  readonly fillIndices: Uint8Array;
  readonly fillIndexCount: number;
  readonly lineVertices: Uint8Array;
  readonly lineLevelEnds: readonly number[];
  readonly signs: Uint8Array;
  readonly signCount: number;
};
