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
      passes: readonly ContentPass[];
      /**
       * How this step treats the target row's depth. Absent ⇒ the colour
       * attachment's first-touch rule (clear on the frame's first pass against
       * the target, load after). `'clear'` restarts depth mid-frame, for
       * successive slabs drawn back-to-front into one foreground row.
       * `'sample'` attaches no depth at all — WebGPU forbids binding a view as
       * a texture while it is attached to the same pass.
       */
      depth?: 'clear' | 'load' | 'sample';
      /**
       * Which array layer of a `fixedSizePx` target this step writes — the
       * black-hole lens's 6-face sky-cubemap capture alone. It disambiguates
       * the six steps all sharing `('sky-cubemap', NEAR0)`; a body row gets its
       * own `slab` index and so needs none.
       */
      face?: CubeFace;
      /**
       * Authored GPU-timing slot suffix (`RenderStepSpec.slot`); a merged step
       * keeps the FIRST line's. Absent ⇒ bills the bare `groupKeyOf(target, slab)`.
       */
      slot?: string;
    }
  | { kind: 'composite'; step: CompositeStep }
  | { kind: 'bloom' };
