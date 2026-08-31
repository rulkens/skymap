/**
 * Public handle returned by `createLabelRenderer`.  Mirrors the shape of
 * other engine handles (`ThumbnailSubsystem`, `BiasCorrectionSubsystem`):
 * explicit method type, no internals leaked.
 */

import type { Label2D } from './Label2D';
import type { LabelBBox } from './LabelBBox';
import type { Vec2 } from '../math/Vec2';

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
   * Ink bounding box the label's text will occupy, in atlas pixels
   * relative to the projected anchor (alignment shifts already applied
   * — see LabelBBox).  Null when the text lays out to no glyphs.
   *
   * Lives on the renderer because measurement needs the font metrics
   * the renderer already owns; the label director scales the box by its
   * CPU-side reproduction of the shader's em clamp to declutter on
   * actual text rects rather than anchor points.  Memoized per
   * (font, alignment, text), so per-frame calls are cheap.
   */
  measure(label: Label2D): LabelBBox | null;
  /**
   * Issue the label draw call into an in-flight render pass.  Must be
   * called inside a `beginRenderPass` / `pass.end()` block by a `Pass`
   * implementation.  The pass's render target format must match the
   * `targetFormat` passed to `createLabelRenderer`.
   *
   * `sceneDepthView` is consumed only by an instance created with
   * `occludeAgainstDepth: 'compare' | 'coverage'`, where it feeds the group(1)
   * depth joint so fragments behind a nearer solar-system body are discarded
   * (per-pixel body occlusion).  The mode picks the occluder — `'compare'` for
   * same-slab NEAR0 captions, `'coverage'` for cross-slab COSMO overlays.  A
   * plain instance ignores it.
   */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewportSize: Vec2,
    sceneDepthView?: GPUTextureView,
  ): void;
  /** Total glyph count across all active labels. Used by tests + debug HUD. */
  glyphCount(): number;
  /** Number of labels last passed to setLabels. Used by tests + debug HUD. */
  labelCount(): number;
  /**
   * The label rows `setLabels` actually packed — the drawn set, `maxLabels`
   * truncation applied. The pick path derives its hit rects from this so a
   * label is clickable exactly where it is legible; nothing else should read
   * it (the GPU buffers hold the authoritative copy).
   */
  packedLabels(): readonly Label2D[];
  /** Release all GPU resources. No-op if constructed with a null device. */
  destroy(): void;
};
