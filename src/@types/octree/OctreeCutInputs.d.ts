import type { OctreeCutSpec } from './OctreeCutSpec';

/** What the GPU cut reads of a frame: the cut's determinants and the clock that stamps each fade step. */
export type OctreeCutInputs = {
  readonly cut: OctreeCutSpec;
  readonly nowMs: number;
};
