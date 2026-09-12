/**
 * ExecuteFrameArgs — the input bag for `executeFrame()`, the single
 * strategy-parameterized site that walks a `FrameStep[]` program into one
 * GPU command encoder.
 *
 * `skyCubemapFaceContexts` is the black-hole lens's per-face camera override:
 * a step carrying `face` resolves its `SlabView`/`ctx` from THIS map, not the
 * frame-wide `ctx`. `renderFrame` derives it on a bake; `FRAME_ORDER` stays
 * static and never sees it. Absent/missing-face ⇒ the step is skipped cleanly,
 * as when `skyCubemapFaceContext` itself returns `null` pre-bootstrap.
 */

import type { ReadyFrameContext } from './ReadyFrameContext';
import type { FrameStep } from './FrameStep';
import type { RenderStrategy } from './RenderStrategy';
import type { EngineState } from '../state/EngineState';
import type { GpuTimingService } from '../../gpu/timing/GpuTimingService';
import type { CubeFace } from '../../rendering/CubeFace';

export type ExecuteFrameArgs = {
  /** The single per-frame command encoder every step records into. */
  encoder: GPUCommandEncoder;
  /** This frame's ready context — slab table, render targets, camera snapshot. */
  ctx: ReadyFrameContext;
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
  /** Per-face camera override for sky-cubemap capture steps; see above. */
  skyCubemapFaceContexts?: ReadonlyMap<CubeFace, ReadyFrameContext>;
};
