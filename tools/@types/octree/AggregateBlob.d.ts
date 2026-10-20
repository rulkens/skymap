/** A node's subtree totals as a rule sees them when it forms the blob; one scratch object, rewritten per node. */
export type AggregateBlob = {
  subFlux: number;
  subCount: number;
  boxMin: readonly number[];
  edge: number;
};
