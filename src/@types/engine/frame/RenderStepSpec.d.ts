/**
 * RenderStepSpec — an authored `FRAME_ORDER` line drawing a named roster into
 * one `(target, slab)` group, in the listed order.
 */

import type { BodyRowSource } from './BodyRowSource';
import type { DepthSampleSource } from './DepthSampleSource';

export type RenderStepSpec = {
  readonly kind: 'render';
  readonly target: string;
  /** A fixed slab index, or a body-row list the frame resolves: one step per row. */
  readonly slab: number | BodyRowSource;
  readonly passes: readonly string[];
  /** See `FrameStep`'s `depth`. */
  readonly depth?: 'clear' | 'load' | DepthSampleSource;
  /**
   * GPU-timing slot suffix, appended to `groupKeyOf(step)` with the same
   * separator; the one line in a group without it owns the bare key. A name, not
   * an ordinal — inserting a line renumbers nothing.
   */
  readonly slot?: string;
};
