/**
 * ContentCompute — one compute dispatch and its own gate. WHERE it runs is not
 * here: `FRAME_ORDER` names the row on the `{ kind: 'compute' }` line that
 * states its place in the prelude, so a row and the order cannot disagree.
 */

import type { FrameView } from './FrameView';
import type { PassState } from './PassState';
import type { SectionScope } from './SectionScope';
import type { ClaimTimestampWrites } from '../../gpu/timing/ClaimTimestampWrites';

export type ContentCompute = {
  /** What `FRAME_ORDER` names, and `computeTimingSlotName` suffixes. Globally unique. */
  readonly name: string;
  /** Must equal the scope of the section its `{ kind: 'compute' }` line sits
   *  in — `checkFrameOrder` rejects a mismatch at boot. */
  readonly scope: SectionScope;
  /**
   * Encode into the frame's single command encoder. Carries its own gate — a
   * row that declines encodes nothing. `claimTimestampWrites` is LAZY: claim it
   * at the moment a pass opens, never up front, or a declining row reports the
   * query set's stale ticks.
   */
  encode(
    encoder: GPUCommandEncoder,
    ctx: FrameView,
    state: PassState,
    claimTimestampWrites: ClaimTimestampWrites,
  ): void;
};
