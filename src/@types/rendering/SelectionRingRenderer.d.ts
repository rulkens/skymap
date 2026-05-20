/**
 * Public handle returned by `createSelectionRingRenderer`. Mirrors the
 * shape of every other lightweight renderer in the project: explicit
 * method types, no internals leaked.
 *
 * Holds one selection at a time. `setSelection(null)` clears it; the
 * pass uses `hasSelection()` as a draw-gate proxy and `render` is a
 * no-op when nothing is selected.
 */

import type { Vec3 } from '../math/Vec3';

export type SelectionRingRenderer = {
  /** Human-readable identifier (`'selectionRingRenderer'`). */
  readonly label: string;
  /**
   * Replace the current selection. Pass `null` to clear — the next
   * `render` becomes a no-op and `hasSelection()` returns `false`.
   * `ringRadiusPx` is the final CSS-pixel radius; the caller must
   * have already baked in the 8× halo factor.
   */
  setSelection(value: { worldPos: Readonly<Vec3>; ringRadiusPx: number } | null): void;
  /** True when a non-null selection is currently set. */
  hasSelection(): boolean;
  /**
   * Record the draw into an in-flight render pass. Must be called
   * inside a `beginRenderPass` block on the swap-chain texture
   * (premultiplied-OVER blend expects an LDR target). No-op when
   * `hasSelection()` is false.
   */
  render(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewportSize: [number, number],
  ): void;
  /** Release all GPU resources. No-op if constructed with a null device. */
  destroy(): void;
};
