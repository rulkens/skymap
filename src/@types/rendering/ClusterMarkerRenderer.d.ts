/**
 * Public handle returned by `createClusterMarkerRenderer`.  Mirrors
 * `MarkerLineRenderer`'s shape: typed methods, no internals leaked.
 *
 * One renderer draws halos + rings for ALL POI categories.  Per-category
 * source-code differentiation happens inside the renderer (three
 * pre-built per-source bind groups) so plan 3's pick path inherits the
 * correct (sourceCode << 27) | poiIndex packing without further
 * scaffolding.
 */

import type { ClusterMarkerDescriptor } from './ClusterMarkerDescriptor';

export type ClusterMarkerRenderer = {
  /** Human-readable identifier. */
  readonly label: string;
  /**
   * Replace the current marker set.  Calling `setMarkers([])` clears all markers.
   * The descriptors are partitioned internally by `category` so the renderer
   * can issue one draw per category (halo) and one per category (ring),
   * each bound to that category's SourceUniforms.
   *
   * Designed to be called by `runFrame.ts` once per frame from the
   * output of `state.subsystems.pois.produceMarkers(state, ctx)`.
   */
  setMarkers(descriptors: readonly ClusterMarkerDescriptor[]): void;
  /**
   * Issue the draws inside an in-flight render pass against the HDR target.
   *
   * `fadeOpacity` is the per-frame opacity scalar for the entire marker
   * layer.  Folded into the alpha output via the shared
   * `lib::fadeUniforms::applyFade` helper — same contract as
   * `filamentRenderer.draw(... fadeOpacity)`.  At v1 the pass file
   * passes a constant 1.0; a future FadeRegistry handle for cluster
   * markers (e.g. for layer-toggle animations) can substitute its
   * per-frame value here.
   */
  render(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewportSize: [number, number],
    fadeOpacity: number,
  ): void;
  /** Number of markers last passed to setMarkers.  Used by the pass `enabled()` check. */
  markerCount(): number;
  /** Release all GPU resources.  No-op if constructed with a null device. */
  destroy(): void;
};
