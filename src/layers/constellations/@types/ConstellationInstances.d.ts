/** The flattened instance buffer plus its segment count (== instance count). */
export type ConstellationInstances = {
  readonly data: Float32Array;
  readonly segmentCount: number;
};
