/**
 * Public handle returned by `createSelectionRingRenderer`. Mirrors the
 * shape of every other lightweight renderer in the project: explicit
 * method types, no internals leaked.
 *
 * Stateless w.r.t. selection. The renderer holds no current selection;
 * the caller passes the per-frame value to `draw`, which the pass
 * already derives fresh every frame from the tagged `FocusableTarget`.
 * A renderer-held mirror would be a second copy of a value the pass
 * recomputes anyway — so `draw(selection)` takes it as an argument and
 * `null` is the no-op.
 */

import type { Vec2 } from '../math/Vec2';
import type { Vec3 } from '../math/Vec3';

export type SelectionRingRenderer = {
  /** Human-readable identifier (`'selectionRingRenderer'`). */
  readonly label: string;
  /**
   * Draw the selection halo for `selection` into an in-flight render pass.
   * `selection === null` is a no-op (nothing selected this frame).
   * `ringRadiusPx` is the final CSS-pixel radius — the caller has already
   * baked in the halo factor. Must be called inside a `beginRenderPass`
   * block on the swap-chain texture (premultiplied-OVER expects an LDR target).
   *
   * `sceneColorView` is consumed only by an instance created with
   * `occludeAgainstDepth: 'compare' | 'coverage'`, where it feeds the group(1)
   * coverage joint so fragments behind an opaque solar-system body are
   * discarded (per-pixel body occlusion, read from the foreground colour
   * target's alpha — see lib/sceneDepth.wesl).  The mode only picks which
   * entry point compiles in; both run the identical coverage test.  A plain
   * instance ignores it.
   */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewportSize: Vec2,
    selection: { worldPos: Readonly<Vec3>; ringRadiusPx: number } | null,
    sceneColorView?: GPUTextureView,
  ): void;
  /** Release all GPU resources. No-op if constructed with a null device. */
  destroy(): void;
};
