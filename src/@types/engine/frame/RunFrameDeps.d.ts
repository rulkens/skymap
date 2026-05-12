/**
 * RunFrameDeps — closure captures the per-frame body relies on.
 *
 * Every entry was a free reference in the original
 * `engine.ts:1407–1708` body; the survey done in Phase 3 Task 3.1
 * enumerated each one by source (createEngine arg, IIFE-local renderer,
 * createEngine helper, etc.) and confirmed read-only vs. mutated.
 * `lastReportedFps` is the only mutated entry, hence the `{current}`
 * box.
 */

import type { EngineCallbacks } from '../EngineCallbacks';
import type { TexturedQuadRenderer } from '../../rendering/TexturedQuadRenderer';
import type { TexturedDiskRenderer } from '../../rendering/TexturedDiskRenderer';
import type { ProceduralDiskRenderer } from '../../rendering/ProceduralDiskRenderer';
import type { MilkyWayRenderer } from '../../rendering/MilkyWayRenderer';
import type { FilamentRenderer } from '../../rendering/FilamentRenderer';
import type { FpsCounter } from '../subsystems/FpsCounter';

export type RunFrameDeps = {
  /** createEngine arg — for resize + viewport reads. */
  canvas: HTMLCanvasElement;
  /** createEngine arg — for `onFpsChange` / `onSourceMaskChange` echoes. */
  cb: EngineCallbacks;
  /** Rolling 60-frame counter; `.sample()` called once per frame. */
  fpsCounter: FpsCounter;
  /**
   * Mutable: last integer fps value reported via `cb.onFpsChange`.
   * Boxed as `{current}` so the body's write round-trips back into
   * createEngine's scope across the module boundary.  See the module
   * header for the why.
   */
  lastReportedFps: { current: number | null };
  /** GPU device handle from `initGpu`. */
  device: GPUDevice;
  /** Swap-chain context handle from `initGpu`. */
  context: GPUCanvasContext;
  /** Milky-Way impostor renderer; instantiated inside the IIFE. */
  milkyWayRenderer: MilkyWayRenderer;
  /** Filament renderer; instantiated inside the IIFE. */
  filamentRenderer: FilamentRenderer;
  /** Textured-quad renderer for galaxy thumbnails. */
  texturedQuadRenderer: TexturedQuadRenderer;
  /** 3D-oriented disk renderer for large galaxies. */
  texturedDiskRenderer: TexturedDiskRenderer;
  /** Procedural-disk renderer (LOD-1; synthetic ellipse fill). */
  proceduralDiskRenderer: ProceduralDiskRenderer;
  /**
   * Wall-clock epoch (ms, from `performance.now`) snapshot taken at
   * engine construction; used to derive the Milky Way impostor's iTime
   * each frame.
   */
  milkyWayITimeEpochMs: number;
};
