/**
 * FrameStep — one entry in the ordered program `executeFrame` walks, expanded
 * from a `FRAME_ORDER` line plus this frame's own lists. A render step carries
 * the passes it draws, so the executor selects nothing.
 *
 * `'bloom'` is one step rather than N render steps because a ping-pong mip
 * pyramid writes the same target twice with different ops, which the one-pass-
 * per-step model cannot express — `runBloom` opens its ten in strict order.
 */

import type { CaptureFaceRef } from './CaptureFaceRef';
import type { CompositeStep } from './CompositeStep';
import type { ContentPass } from './ContentPass';

export type FrameStep =
  | { kind: 'compute'; name: string }
  | {
      kind: 'render';
      target: string;
      slab: number;
      /** The passes this step draws, in draw order. */
      passes: readonly ContentPass[];
      /**
       * Depth load-op for this step's pass. Absent ⇒ the same first-touch rule
       * the colour attachment follows (clear on the frame's first pass against
       * the target, load after). Steps that SHARE a depth target but must not
       * share its depth — successive slabs drawn back-to-front into one
       * foreground row — declare `'clear'` to restart depth mid-frame.
       */
      depthLoad?: 'clear' | 'load';
      /**
       * The capture row + array layer this step writes, when it is a capture
       * step; absent for every ordinary render step. It disambiguates steps
       * that would otherwise collide on `(target, slab)` — all six faces share
       * `('sky-cubemap', NEAR0)`, unlike a body row, unique by `slab` alone —
       * and names the face's synthetic camera for the executor.
       */
      capture?: CaptureFaceRef;
      /**
       * Authored GPU-timing slot suffix (`RenderStepSpec.slot`), carried
       * through expansion so a merged step keeps the FIRST line's slot name.
       * Absent ⇒ this step bills the bare `groupKeyOf(step)`.
       */
      slot?: string;
    }
  | { kind: 'composite'; step: CompositeStep }
  | { kind: 'bloom' };
