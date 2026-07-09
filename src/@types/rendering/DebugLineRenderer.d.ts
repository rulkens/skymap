/**
 * Public handle returned by `createDebugLineRenderer` — the dedicated
 * debug-draw pass's thick-line renderer.
 *
 * Same screen-quad technique as `MarkerLineRenderer` (it reuses the
 * `shaders/markerLines/*` shaders), but its input is the leaner `DebugLine`:
 * no id / fade / owner. Debug overlays rebuild and upload their whole line set
 * each frame, so there is no reconcile or declutter contract to honour — just
 * geometry + premultiplied colour.
 */

import type { DebugLine } from './DebugLine';
import type { Vec2 } from '../math/Vec2';

export type DebugLineRenderer = {
  /** Human-readable identifier (`'debugLineRenderer'`). Part of `Renderer`. */
  readonly label: string;
  /**
   * Replace the current line set. `setLines([])` clears all lines. Re-packs the
   * CPU instance scratch buffer and, if a real device is present, uploads it.
   * Called every frame by the clip-path debug pass with the freshly built set.
   */
  setLines(lines: DebugLine[]): void;
  /**
   * Issue the draw call into an in-flight render pass. Must run inside a
   * `beginRenderPass` / `pass.end()` block. The pass target format must match
   * the `targetFormat` passed to `createDebugLineRenderer`.
   */
  draw(pass: GPURenderPassEncoder, viewProj: Float32Array, viewportSize: Vec2): void;
  /** Number of lines last passed to setLines. Used by tests + the debug pass. */
  lineCount(): number;
  /** Release all GPU resources. No-op if constructed with a null device. */
  destroy(): void;
};
