/**
 * FrameStep — one entry in the ordered program `executeFrame` walks, expanded
 * from a `FRAME_ORDER` line plus this frame's own lists. A render step carries
 * the passes it draws, so the executor selects nothing.
 *
 * `'bloom'` is one step rather than N render steps because a ping-pong mip
 * pyramid writes the same target twice with different ops, which the one-pass-
 * per-step model cannot express — `runBloom` opens its ten in strict order.
 */

import type { CompositeStep } from './CompositeStep';
import type { ContentPass } from './ContentPass';
import type { CubeFace } from '../../rendering/CubeFace';

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
       * Which array layer of a `fixedSizePx` target this step writes — today
       * only the black-hole lens's 6-face sky-cubemap capture. Absent for every
       * ordinary render step. Its sole job is disambiguating several
       * `(target, slab)` steps that would otherwise collide: all six faces
       * share `('sky-cubemap', NEAR0)`, unlike a body row (which gets its own
       * `slab` index and so is unique without help).
       */
      face?: CubeFace;
      /**
       * Authored GPU-timing slot suffix (`RenderStepSpec.slot`), carried
       * through expansion so a merged step keeps the FIRST line's slot name.
       * Absent ⇒ this step bills the bare `groupKeyOf(target, slab)`.
       */
      slot?: string;
    }
  | { kind: 'composite'; step: CompositeStep }
  | { kind: 'bloom' };
