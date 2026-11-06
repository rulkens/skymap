import type { SourceType } from '../data/SourceType';

/** One source's row in a `OctreeCutSpec`. */
export type OctreeCutSourceInput = {
  readonly source: SourceType;
  /** The source's handed fade (band included). */
  readonly opacity: number;
  readonly drawBudget: number;
};
