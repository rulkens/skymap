/**
 * RenderFrameInput — per-frame inputs for `renderFrame()`.
 *
 * Every field is read; nothing is mutated.  The encoder is created
 * and finished inside `renderFrame` so no GPU lifecycle leaks back
 * to the caller.
 *
 * ### `state` arrived in D.2
 *
 * Pre-D.2, `renderFrame` consumed only the per-frame snapshot
 * (`ctx`) plus a flat settings bag — engine state was never read
 * directly here.  The flat bag is now dissolved: every pass reads
 * `state.settings.*` directly, so the only non-state inputs are
 * the GPU device/context, the per-frame snapshot (`ctx`), and the
 * timing service.
 *
 * ### Why no renderer fields
 *
 * Pre-unification this type carried seven renderer handles
 * (`milkyWayCloudRenderer`, `horizonShellRenderer`, `filamentRenderer`,
 * `volumeFieldRenderer`, `flowFieldRenderer`, `texturedDiskRenderer`,
 * `proceduralDiskRenderer`) forwarded only so `renderFrame` could bundle
 * them into a `PassDeps` bag for the not-yet-converted UI overlay layers.
 * Every `ContentLayer` — HDR and swap-target alike — now reads its renderer
 * straight off `state.gpu.*` (see `passes/index.ts`), so `PassDeps` and
 * these fields are both gone; `state` is the only per-frame renderer source.
 */

import type { EngineState } from '../state/EngineState';
import type { GpuTimingService } from '../../gpu/timing/GpuTimingService';
import type { ReadyFrameContext } from './ReadyFrameContext';

export type RenderFrameInput = {
  /**
   * Per-frame derived snapshot.  Carries the camera, view-projection
   * matrix, viewport size, camera-position tuple, pixel-per-radian
   * scalar, plus the post-bootstrap-narrowed `renderer`, `postProcess`,
   * and `thumbnails` handles.  See `frameContext.ts`.
   */
  ctx: ReadyFrameContext;
  /**
   * Engine state — forwarded to each `ContentLayer.draw` so per-layer logic
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
