/**
 * Public handle returned by `createLabelPickRenderer` — the r32uint pick
 * provider for rendered text labels. One instance per slab: the pick target's
 * depth format and the slab's depth convention are baked in at construction.
 */

import type { LabelPickQuad } from './LabelPickQuad';
import type { PickWindow } from '../engine/frame/PickWindow';

export type LabelPickRenderer = {
  /** Human-readable identifier — part of the shared `Renderer` contract. */
  readonly label: string;
  /**
   * Record one instanced draw of `quads` into an already-begun r32uint pick
   * pass. Empty input is a no-op. Quads are drawn in array order and all share
   * one depth band, so the FIRST of two overlapping quads wins the pixel —
   * pass them nearest-subject-first. Rects are canvas px; they rasterise
   * through `window`, the pick target's rectangle of the canvas.
   *
   * Binds its own `@group(0)`; a COSMO caller must restore the shared
   * point-pick camera prefix afterwards (see `ContentPass.drawPick`).
   */
  draw(pass: GPURenderPassEncoder, quads: readonly LabelPickQuad[], window: PickWindow): void;
  /** Release the uniform + instance buffers. */
  destroy(): void;
};
