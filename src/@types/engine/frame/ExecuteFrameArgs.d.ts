/**
 * ExecuteFrameArgs — the input bag for `executeFrame()`, the single
 * strategy-parameterized site that walks a `FrameStep[]` program into one
 * GPU command encoder.
 *
 * Every value the executor needs rides in on this struct rather than being
 * reached out of `state`, so the frame's one imperative loop reads as a pure
 * function of its inputs:
 *
 *   - `program` is the ordered step list (`frameProgram(tone)`), the frame as
 *     data — the executor is the only code that walks it.
 *   - `layers` is the content-layer registry; each `'render'` step selects its
 *     group out of this list by `(target, slab)` plus the layer's own gate.
 *   - `strategy` is how a render step's group becomes GPU passes ('merged' in
 *     production, 'perLayerTimed' under `?gpuTimings`) — a property of *how* a
 *     render step executes, applied uniformly, not a fork per render step.
 *   - `timing` supplies the per-pass `timestampWrites` descriptor (a no-op in
 *     production); `swapView` is this frame's acquired swap-chain view, the
 *     one render target that is not an allocated offscreen texture.
 *   - `skyCubemapFaceContexts` is the black-hole lens's per-face camera
 *     override, its runtime hand-off: a step carrying `face`
 *     resolves its `SlabView`/`ctx` from THIS map instead of the frame-wide
 *     `ctx` above. `renderFrame` derives it on a bake (one
 *     `skyCubemapFaceContext` call per face); `frameProgram`
 *     stays static and never sees it. Absent/missing-face ⇒ that step is
 *     skipped cleanly (no throw) — the same outcome as
 *     `skyCubemapFaceContext` itself returning `null` for a pre-bootstrap
 *     frame.
 */

import type { ReadyFrameContext } from './ReadyFrameContext';
import type { FrameStep } from './FrameStep';
import type { ContentLayer } from './ContentLayer';
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
  /** The ordered step program to walk (`frameProgram(tone)`). */
  program: readonly FrameStep[];
  /** The content-layer registry each render step selects its group from. */
  layers: readonly ContentLayer[];
  /** How each render step's layer group becomes GPU passes. */
  strategy: RenderStrategy;
  /** Per-pass GPU-timing descriptor source (no-op when timing is disabled). */
  timing: GpuTimingService;
  /** This frame's swap-chain view — the `'swap'` target's texture view. */
  swapView: GPUTextureView;
  /** Per-face camera override for sky-cubemap capture steps; see above. */
  skyCubemapFaceContexts?: ReadonlyMap<CubeFace, ReadyFrameContext>;
};
