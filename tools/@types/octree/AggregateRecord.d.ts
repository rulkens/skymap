/** One own record as a rule sees it; a single scratch object is rewritten per record, never allocated. */
export type AggregateRecord = {
  /** Input value on axis `a` (the position for a centroid, the column value otherwise). */
  value: (a: number) => number;
  flux: number;
  boxMin: readonly number[];
  edge: number;
};
