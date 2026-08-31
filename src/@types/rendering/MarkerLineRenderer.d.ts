/**
 * Public handle returned by `createMarkerLineRenderer`.  Mirrors the shape of
 * other engine handles (`ThumbnailSubsystem`, `LabelRenderer`): explicit
 * method type, no internals leaked.
 */

import type { MarkerLine } from './MarkerLine';
import type { Vec2 } from '../math/Vec2';

export type MarkerLineRenderer = {
  /**
   * Human-readable identifier (`'markerLineRenderer'`).  Part of the
   * shared `Renderer` contract — see `Renderer.d.ts`.
   */
  readonly label: string;
  /**
   * Replace the current line set.  Calling `setLines([])` clears all lines.
   * Re-packs the CPU-side instance scratch buffer and, if a real GPU device
   * is present, uploads to the GPU instance buffer.
   *
   * Designed to be called by the label director after polling
   * `produceMilkyWayLabel` + the structure/famous producers whenever the
   * merged line set changes (e.g. camera distance crosses the Milky Way fade
   * band threshold). For typical use-cases there will be 1–3 lines so the cost
   * is negligible.
   */
  setLines(lines: MarkerLine[]): void;
  /**
   * Issue the marker-line draw call into an in-flight render pass.  Must be
   * called inside a `beginRenderPass` / `pass.end()` block by a `Pass`
   * implementation.  The pass's render target format must match the
   * `targetFormat` passed to `createMarkerLineRenderer`.
   *
   * `sceneColorView` is consumed only by an instance created with
   * `occludeAgainstScene: true`, where it feeds the group(1) coverage joint so
   * fragments are attenuated by how much of the background the foreground
   * bodies already cover (read from that target's alpha — see
   * lib/sceneDepth.wesl).  A plain instance ignores it.
   */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewportSize: Vec2,
    sceneColorView?: GPUTextureView,
  ): void;
  /** Number of lines last passed to setLines. Used by tests + debug HUD. */
  lineCount(): number;
  /** Release all GPU resources. No-op if constructed with a null device. */
  destroy(): void;
};
