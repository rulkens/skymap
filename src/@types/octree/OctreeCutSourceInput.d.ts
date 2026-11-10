import type { SourceId } from '../data/SourceId';

/** One source's row in a `OctreeCutSpec`. */
export type OctreeCutSourceInput = {
  readonly source: SourceId;
  /** The source's handed fade (band included). */
  readonly opacity: number;
  readonly drawBudget: number;
};
