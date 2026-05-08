/**
 * EngineGpuHandles — the GPU pipelines / targets sub-bag of the
 * canonical `EngineState`.
 *
 * ### Why these fields start as null
 *
 * `createEngine` returns its handle synchronously, but the actual GPU
 * pipelines need an async `requestAdapter()` → `requestDevice()` chain.
 * The engine threads this through an async IIFE that runs in the
 * background after the handle has already been returned, so for one or
 * two frames at startup these handles are unavailable.  Modelling them
 * as `T | null` (rather than non-null with a separate "ready" flag)
 * makes the consumer null-check honest — every site that touches a
 * pipeline has to acknowledge the not-yet-built case, instead of relying
 * on a single boolean that someone might forget to read.
 *
 * ### Lifecycle
 *
 *   1. Sub-bag constructed with every field = null.
 *   2. Async IIFE runs: each field gets assigned exactly once after
 *      `initGpu` resolves.
 *   3. `destroy()` releases each pipeline and resets the field back to
 *      null for symmetry — this matters when the React layer remounts
 *      the canvas (StrictMode, hot-reload) and a fresh `createEngine`
 *      runs against a stale state object would otherwise see "ready"
 *      handles pointing at destroyed GPU resources.
 *
 * ### Why grouped vs. flat?
 *
 * Mirrors the original closure grouping in pre-Phase-4 `engine.ts`,
 * where these bindings sat together under one header comment.
 * Keeping the bag named lets the renderFrame helper accept just the
 * GPU bag rather than the whole `EngineState`.
 */

import type { PointRenderer } from '../services/gpu/pointRenderer';
import type { PostProcess } from '../services/gpu/passes/postProcess';
import type { createPickRenderer } from '../services/gpu/pickRenderer';
import type { FilamentRenderer } from '../services/gpu/filamentRenderer';

export type EngineGpuHandles = {
  renderer: PointRenderer | null;
  pickRenderer: ReturnType<typeof createPickRenderer> | null;
  /**
   * Combined HDR offscreen target + tone-map post-process.  Pre-Phase-4
   * this was two fields (`hdrTarget` + `toneMapPass`); they merged into
   * one because their lifetimes are identical and they're always used
   * together (HDR pass writes the texture, post-process samples it).
   * See `services/gpu/postProcess.ts` for the rationale.
   */
  postProcess: PostProcess | null;
  /**
   * Cosmic-web filament-skeleton renderer.  Constructed unconditionally
   * during GPU init (the pipeline is cheap), stays empty-segment until
   * the optional `loadFilaments()` resolves with a non-null cloud.
   * Stored on the GPU bag so `destroy()` can release the per-instance
   * buffer + uniform buffer + quad VBO without needing the construction-
   * time closure to outlive the public handle.
   */
  filamentRenderer: FilamentRenderer | null;
};
