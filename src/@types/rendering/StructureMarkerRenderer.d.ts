/**
 * Public handle returned by `createStructureMarkerRenderer`.  Mirrors
 * `MarkerLineRenderer`'s shape: typed methods, no internals leaked.
 *
 * One renderer draws halos + rings for ALL structure categories
 * (cluster / supercluster / void / group).  Per-category source-code
 * differentiation happens inside the renderer (one pre-built per-source
 * bind group each) so the pick path gets the correct
 * (sourceCode << 26) | structureIndex packing for free.
 */

import type { StructureMarkerDescriptor } from './StructureMarkerDescriptor';
import type { Vec2 } from '../math/Vec2';

export type StructureMarkerRenderer = {
  /** Human-readable identifier. */
  readonly label: string;
  /**
   * Replace the current marker set.  Calling `setMarkers([])` clears all markers.
   * The descriptors are partitioned internally by `category` so the renderer
   * can issue one draw per category (halo) and one per category (ring),
   * each bound to that category's SourceUniforms.
   *
   * Designed to be called by `runFrame.ts` once per frame from the
   * output of `produceStructureMarkers(state, ctx)`.
   */
  setMarkers(descriptors: readonly StructureMarkerDescriptor[]): void;
  /**
   * Issue the draws inside an in-flight render pass against the HDR target.
   *
   * `fadeOpacity` is the per-frame opacity scalar for the entire marker
   * layer.  Folded into the alpha output via the shared
   * `lib::fadeUniforms::applyFade` helper — same contract as
   * `filamentRenderer.draw(... fadeOpacity)`.  The pass file passes a
   * constant 1.0; a FadeRegistry handle for structure markers (e.g. for
   * layer-toggle animations) can substitute its per-frame value here.
   */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewportSize: Vec2,
    fadeOpacity: number,
  ): void;
  /** Number of markers last passed to setMarkers.  Used by the pass `enabled()` check. */
  markerCount(): number;
  /**
   * Issue one ring-pick draw per structure category (cluster /
   * supercluster / void / group) into the caller-supplied render pass.
   * The pass MUST already have:
   *
   *   - The pick-pass colour attachment (r32uint pick texture) bound.
   *   - A `depth24plus` depth attachment bound (this pipeline writes +
   *     tests depth so a galaxy in front of a ring claims the pixel).
   *   - `@group(0)` (CameraUniforms) already set by the caller —
   *     `pickRing` deliberately does NOT bind it.  The galaxy pick draws
   *     bind the same canonical `@group(0)` immediately beforehand and
   *     we reuse that bind so the per-frame uniforms aren't re-sent.
   *
   * `pickRing` does bind `@group(1)` (a dummy zeroed FadeUniforms — the
   * pick fragment doesn't read fade.opacity) and `@group(2)` (the
   * per-category SourceUniforms whose `sourceCode` the fragment ORs
   * into the packed identity).
   *
   * Why a method on the renderer rather than a free function: the
   * renderer owns the pick pipeline, the per-category SourceUniforms
   * bind groups, and the instance vertex buffer.  Exposing those to a
   * free function would widen the renderer's public surface for one
   * consumer (the engine's pick pass).
   */
  pickRing(passEncoder: GPURenderPassEncoder): void;
  /** Release all GPU resources.  No-op if constructed with a null device. */
  destroy(): void;
};
