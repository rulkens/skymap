/**
 * ExecuteFrameArgs — the input bag for `executeFrame()`, the single
 * strategy-parameterized site that walks a `FrameStep[]` program into one
 * GPU command encoder.
 *
 * `captureContexts` is the per-capture, per-face override: a step carrying
 * `capture` resolves its `SlabView`/`ctx` from THIS map's `CaptureFace.ctx`,
 * not the frame-wide `ctx`. `scheduleCubemapCaptures` derives it on a bake;
 * `FRAME_ORDER` stays static and never sees it. Absent/missing-face ⇒ the step
 * is skipped cleanly, as when a bake finds `cubemapCaptureFrame` not ready pre-bootstrap.
 */

import type { CaptureFaceContexts } from './CaptureFaceContexts';
import type { FrameView } from './FrameView';
import type { FrameStep } from './FrameStep';
import type { RenderStrategy } from './RenderStrategy';
import type { EngineState } from '../state/EngineState';
import type { GpuTimingService } from '../../gpu/timing/GpuTimingService';

export type ExecuteFrameArgs = {
  /** The single per-frame command encoder every step records into. */
  encoder: GPUCommandEncoder;
  /** This view — slab table, camera, its own `renderedTargets`; frame-wide
   *  facts (render targets, clock) are `ctx.snapshot.*`. */
  ctx: FrameView;
  /** Live engine state — layers read their renderers/gates off `state.*`. */
  state: EngineState;
  /** The ordered step program to walk (`expandFrameOrder(FRAME_ORDER, …)`). */
  program: readonly FrameStep[];
  /** How each render step's layer group becomes GPU passes. */
  strategy: RenderStrategy;
  /** Per-pass GPU-timing descriptor source (no-op when timing is disabled). */
  timing: GpuTimingService;
  /** This frame's swap-chain view — the `'swap'` target's texture view. */
  swapView: GPUTextureView;
  /** Per-face override for this frame's capture steps; see above. */
  captureContexts?: CaptureFaceContexts;
};
