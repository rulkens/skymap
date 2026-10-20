import type { SourceType } from '../data/SourceType';

/** One source's row in a `OctreeCutSpec`. */
export type OctreeCutSourceInput = {
  readonly source: SourceType;
  /** The source's distance crossfade. */
  readonly opacity: number;
  readonly drawBudget: number;
};
