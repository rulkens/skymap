/** What one dispatch varies between a source's live cut and its capture cut. */
export type StarCutVariant = {
  readonly fadeStep: number;
  /** `FLOATS_PER_VIEW` floats per view; none means no prune. */
  readonly planes: Float32Array;
};
