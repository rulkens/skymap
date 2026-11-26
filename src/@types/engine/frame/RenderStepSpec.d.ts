/**
 * RenderStepSpec — an authored `FRAME_ORDER` line drawing a named roster into
 * one `(target, slab)` group, in the listed order.
 */

import type { BodyRowSource } from './BodyRowSource';
import type { DepthSampleSource } from './DepthSampleSource';
import type { MaskSampleSource } from './MaskSampleSource';

export type RenderStepSpec = {
  readonly kind: 'render';
  readonly target: string;
  /** A fixed slab index, or a body-row list the frame resolves: one step per row. */
  readonly slab: number | BodyRowSource;
  readonly passes: readonly string[];
  /** See `FrameStep`'s `depth`. */
  readonly depth?: 'clear' | 'load' | DepthSampleSource;
  /** See `FrameStep`'s `mask`. */
  readonly mask?: MaskSampleSource;
  /**
   * GPU-timing slot suffix, appended to `groupKeyOf(step)` with the same
   * separator; the one line in a group without it owns the bare key. A name, not
   * an ordinal — inserting a line renumbers nothing.
   */
  readonly slot?: string;
  /** A per-view planner planned earlier in this section whose value's `restart` decides a retained
   *  target's first-touch clear. Required on a step whose target row is `retained`. */
  readonly restartPlanner?: string;
};
