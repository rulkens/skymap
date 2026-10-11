/**
 * Public handle returned by `createLabelRenderer`.  Mirrors the shape of
 * other engine handles (`ThumbnailSubsystem`, `BiasCorrectionSubsystem`):
 * explicit method type, no internals leaked.
 */

import type { Label2D } from './Label2D';
import type { Vec2 } from '../math/Vec2';
import type { OverlaySceneOcclusion } from './OverlaySceneOcclusion';

export type LabelRenderer = {
  /**
   * Human-readable identifier (`'labelRenderer'`).  Part of the
   * shared `Renderer` contract — see `Renderer.d.ts`.
   */
  readonly label: string;
  /**
   * Replace the current label set.  Calling `setLabels([])` clears all
   * labels.  Re-packs the CPU-side glyph and label scratch buffers and,
   * if a real GPU device is present, uploads to the GPU storage /
   * instance buffers.
   *
   * Designed to be called by the label director after polling
   * `produceMilkyWayLabel` + the structure/famous producers whenever the
   * merged label set changes (e.g. camera distance crosses the Milky Way
   * fade band threshold). For the "you are here" use-case there will
   * typically be 1–3 labels so the cost is negligible.
   */
  setLabels(labels: readonly Label2D[]): void;
  /**
   * Issue the label draw call into an in-flight render pass.  Must be
   * called inside a `beginRenderPass` / `pass.end()` block by a `Pass`
   * implementation.  The pass's render target format must match the
   * `targetFormat` passed to `createLabelRenderer`.
   *
   * `scene` is consumed only by an instance created with
   * `occludeAgainstScene: true`, where it fills the group(1) coverage joint so
   * fragments are attenuated by how much of the background the foreground
   * bodies already cover (that target's alpha) and by whether the sampled
   * scene depth stands in front of the subject — see lib/sceneDepth.wesl.
   * A plain instance ignores it.
   *
   * `clipScale` is the clip units of `viewProj` relative to Mpc (default 1):
   * the NEAR0 overlays rescale their matrix, and the vertex stage must scale
   * the em into the same units before dividing by `clip.w`.
   */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewportSize: Vec2,
    pxPerRad: number,
    extras?: { scene?: OverlaySceneOcclusion; clipScale?: number },
  ): void;
  /** Release all GPU resources. No-op if constructed with a null device. */
  destroy(): void;
};
