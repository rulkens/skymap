/**
 * Public handle returned by `createLabelRenderer`.  Mirrors the shape of
 * other engine handles (`SelectionSubsystem`, `ThumbnailSubsystem`,
 * `BiasCorrectionSubsystem`): explicit method type, no internals leaked.
 */

import type { Label } from './Label';

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
   * Designed to be called by `youAreHereSubsystem.runFrame` whenever the
   * label set changes (camera distance crosses the fade band threshold).
   * For the "you are here" use-case there will typically be 1–3 labels
   * so the cost is negligible.
   */
  setLabels(labels: readonly Label[]): void;
  /**
   * Issue the label draw call into an in-flight render pass.  Must be
   * called inside a `beginRenderPass` / `pass.end()` block by a `Pass`
   * implementation.  The pass's render target format must match the
   * `format` field of the `GpuContext` passed to `createLabelRenderer`.
   */
  render(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewportSize: [number, number],
  ): void;
  /** Total glyph count across all active labels. Used by tests + debug HUD. */
  glyphCount(): number;
  /** Number of labels last passed to setLabels. Used by tests + debug HUD. */
  labelCount(): number;
  /** Release all GPU resources. No-op if constructed with a null device. */
  destroy(): void;
};
