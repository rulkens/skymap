import type { BrickBox } from './BrickBox';
import type { DetailRegionState } from './DetailRegionState';

export type DetailRegionPlan = {
  readonly state: DetailRegionState;
  /** Target bricks neither held nor failed, nearest first: Chebyshev shell, then Euclidean, from the
   *  centre's brick. */
  readonly wanted: readonly number[];
  /** Boxes drawn this frame (settled, or settled + into + out while fading): their slots stay locked. */
  readonly shown: readonly BrickBox[];
  /** Bricks wanted or a fade running. */
  readonly busy: boolean;
};
