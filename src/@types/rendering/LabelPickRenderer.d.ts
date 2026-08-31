/**
 * Public handle returned by `createLabelPickRenderer` — the r32uint pick
 * provider for rendered text labels. One instance per slab: the pick target's
 * depth format and the slab's depth convention are baked in at construction.
 */

import type { LabelPickQuad } from './LabelPickQuad';
import type { Vec2 } from '../math/Vec2';

export type LabelPickRenderer = {
  /** Human-readable identifier — part of the shared `Renderer` contract. */
  readonly label: string;
  /**
   * Record one instanced draw of `quads` into an already-begun r32uint pick
   * pass. Empty input is a no-op. Quads are drawn in array order and all share
   * one depth band, so the FIRST of two overlapping quads wins the pixel —
   * pass them nearest-subject-first.
   *
   * Binds its own `@group(0)`; a COSMO caller must restore the shared
   * point-pick camera prefix afterwards (see `ContentLayer.drawPick`).
   */
  draw(pass: GPURenderPassEncoder, quads: readonly LabelPickQuad[], viewportPx: Vec2): void;
  /** Release the uniform + instance buffers. */
  destroy(): void;
};
