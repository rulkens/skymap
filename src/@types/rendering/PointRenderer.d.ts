/**
 * PointRenderer — public surface of the point renderer.
 *
 * Mirrors the methods the pre-Spec-F.3 `class PointRenderer` exposed.
 * The only structural change is that the `uniformBuffer` getter
 * collapses to a bare property because the captured buffer is never
 * reassigned over the renderer's lifetime, and `loadedSources` is a
 * function returning a fresh generator on each call (preserving the
 * pre-factory call shape `r.loadedSources()`).
 *
 * Consumers (engine, frame body, picker, bias-correction subsystem)
 * see the identical shape; the only call-site change is
 * `new PointRenderer(...)` → `createPointRenderer(...)`.
 */

import type { mat4 } from 'gl-matrix';
import type { Source } from '../../data/sources';
import type { GalaxyCatalog } from '../data/GalaxyCatalog';
import type { PointDrawSettings } from './PointDrawSettings';

export type PointRenderer = {
  /**
   * Human-readable identifier (`'pointRenderer'`).  Part of the
   * shared `Renderer` contract — see `Renderer.d.ts`.
   */
  readonly label: string;
  /**
   * Pack a `GalaxyCatalog` into an interleaved GPU vertex buffer for the
   * given source.  Replaces any previous buffer for that source.  See
   * the factory body for the off-thread bake / race-condition rationale.
   */
  upload(source: Source, cloud: GalaxyCatalog): Promise<void>;
  /**
   * Remove a source's GPU vertex buffer and reclaim its VRAM.  No-op
   * if the source was never uploaded.
   */
  unload(source: Source): void;
  /**
   * Install the upload-tail callback used by the bias-correction
   * subsystem.  Pass `null` to detach.  Idempotent.
   */
  setBiasUploadCallback(cb: ((source: Source, cloud: GalaxyCatalog) => void) | null): void;
  /** Install the unload-tail callback for the bias-correction subsystem. */
  setBiasUnloadCallback(cb: ((source: Source) => void) | null): void;
  /** Splice per-row Schechter ratios into slot 10 of the source's interleaved mirror. */
  spliceSchechterRatios(source: Source, ratios: Float32Array): void;
  /** Splice per-row HEALPix angular weights into slot 11. */
  spliceAngularWeights(source: Source, weights: Float32Array): void;
  /** Zero slots 10 + 11 for one source or every loaded source. */
  clearBiasOverlays(source?: Source): void;
  /** Total number of points across every loaded source. */
  totalCount(): number;
  /** Per-source point count, or 0 when the source isn't loaded. */
  countOf(source: Source): number;
  /**
   * Iterate over every loaded source's GPU buffer in `Source` enum order.
   * The iterable is generated fresh on each call.
   */
  loadedSources(): IterableIterator<{
    source: Source;
    vertexBuffer: GPUBuffer;
    count: number;
    cloudFadeBuffer: GPUBuffer;
  }>;
  /**
   * @internal
   *
   * Read by `createPickRenderer` — the pick pass shares this uniform
   * buffer with the visual pass so it sees the same view-projection
   * matrix the visual frame just wrote.  Engine code MUST NOT consume
   * this; the coupling is bound at PickRenderer construction time and
   * threaded internally.
   *
   * Pre-Spec-F.3 this was a getter on the class; here it's a bare
   * property because the closure-captured buffer is never reassigned.
   * The semantics are observationally identical from the consumer
   * side — `pointRenderer.uniformBuffer` returns the same GPUBuffer.
   */
  uniformBuffer: GPUBuffer;
  /** Issue one instanced draw call per visible source. */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: mat4,
    viewportPx: [number, number],
    settings: PointDrawSettings,
  ): void;
  /** Whether any loaded source is still ramping up its fade-in opacity. */
  isFading(): boolean;
  /** Release every GPU resource this renderer owns. */
  destroy(): void;
};
