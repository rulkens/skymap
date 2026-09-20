/**
 * RenderFrameInput — per-frame inputs for `renderFrame()`. Every field is
 * read; nothing is mutated. The encoder is created and finished inside
 * `renderFrame`, so no GPU lifecycle leaks back to the caller.
 */

import type { EngineState } from '../state/EngineState';
import type { GpuTimingService } from '../../gpu/timing/GpuTimingService';
import type { FrameView } from './FrameView';

export type RenderFrameInput = {
  /**
   * The frame's own view of the swap chain — what `once` sections run
   * against. They DO read view fields: composite/tonemap resolve
   * `viewFor(dest, ctx, swapView)` through `ctx.output`, and the sky-view
   * compute's `atmosphereDrawList` reads `ctx.cam.distance` / `drawCamPos`.
   */
  canvas: FrameView;
  /** What `perView` sections iterate; mono is `[canvas]`. */
  views: readonly FrameView[];
  /**
   * Engine state — forwarded to each `ContentPass.draw` so per-layer logic
   * can read selection / picking / source-state / settings / `state.gpu.*`
   * renderer handles.
   */
  state: EngineState;

  // ── GPU handles ───────────────────────────────────────────────────────
  device: GPUDevice;
  context: GPUCanvasContext;

  /**
   * Per-pass GPU timing service (always non-null; check `.enabled`
   * before doing timing work).  When enabled, `renderFrame` takes
   * the split-pass path so each HDR pass carries its own
   * `timestampWrites` descriptor, then records the resolve + copy
   * commands via `endFrame` on the same encoder.
   */
  timingService: GpuTimingService;
};
