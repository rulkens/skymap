/**
 * RenderStepSpec — an authored `FRAME_ORDER` line drawing a named roster into
 * one `(target, slab)` group, in the listed order.
 */

import type { BodyRowSource } from './BodyRowSource';

export type RenderStepSpec = {
  readonly kind: 'render';
  readonly target: string;
  /**
   * A fixed slab index, or the name of a body-row list the frame resolves —
   * one step per row, and none at all when the list is empty.
   */
  readonly slab: number | BodyRowSource;
  readonly passes: readonly string[];
  /** Depth treatment for the expanded step(s); see `FrameStep`'s `depth`. */
  readonly depth?: 'clear' | 'load' | 'sample';
  /**
   * GPU-timing slot suffix, appended to `groupKeyOf(target, slab)` with the same
   * separator; the one line in a group without it owns the bare key. Authored
   * here so a slot's identity is a name, not an ordinal — inserting a line
   * renumbers nothing.
   */
  readonly slot?: string;
};
