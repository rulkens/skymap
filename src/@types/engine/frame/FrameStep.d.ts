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
import type { DepthSampleSource } from './DepthSampleSource';

export type FrameStep =
  | { kind: 'compute'; name: string }
  | ({
      kind: 'render';
      slab: number;
      passes: readonly ContentPass[];
      /**
       * How this step treats the target row's depth. Absent ⇒ the colour
       * attachment's first-touch rule (clear on the frame's first pass against
       * the target, load after). `'clear'` restarts depth mid-frame, for
       * successive slabs drawn back-to-front into one foreground row.
       * `{ sample }` names the row whose depth this step reads as a texture and
       * attaches none of its own — WebGPU forbids binding a view as a texture
       * while it is attached to the same pass.
       */
      depth?: 'clear' | 'load' | DepthSampleSource;
      /**
       * Authored GPU-timing slot suffix (`RenderStepSpec.slot`); a merged step
       * keeps the FIRST line's. Absent ⇒ bills the bare `groupKeyOf(step)`.
       */
      slot?: string;
    } & (
      | /** A render-target row by id. */ { target: string; capture?: undefined }
      /**
       * A capture row + one of its array layers, exclusive of `target`: the
       * ROW owns the texture, so the executor resolves the face's attachment
       * from the key alone. It also disambiguates steps that would otherwise
       * collide on `(target, slab)` — all six faces share one `(row, NEAR0)`,
       * unlike a body row, unique by `slab` alone — and names the face's
       * synthetic camera.
       */
      | { target?: undefined; capture: CaptureFaceRef }
    ))
  | { kind: 'composite'; step: CompositeStep }
  | { kind: 'bloom' }
  /** Draws `source` into THIS view's own `ctx.output` (a dome face's
   *  `dome-cube` layer) — no blend, no tone. See `CopyStepSpec`. */
  | { kind: 'copy'; source: string };
