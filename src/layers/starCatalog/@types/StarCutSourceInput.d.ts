import type { SourceType } from '../../../@types/data/SourceType';

/** One source's row in a `StarCutSpec`. */
export type StarCutSourceInput = {
  readonly source: SourceType;
  /** The source's distance crossfade. */
  readonly opacity: number;
  readonly budgetTypical: number;
};
