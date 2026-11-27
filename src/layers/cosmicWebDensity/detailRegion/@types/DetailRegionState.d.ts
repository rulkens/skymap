import type { BrickBox } from './BrickBox';
import type { DetailRegionFade } from './DetailRegionFade';

export type DetailRegionState = {
  /** Every brick inside is in the texture; drawn at weight 1. */
  readonly settled: BrickBox | null;
  readonly fade: DetailRegionFade | null;
  /** False while the eye is beyond the gate distance: the draw value is null, the bricks stay. */
  readonly inReach: boolean;
};
