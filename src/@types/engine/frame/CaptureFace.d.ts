/**
 * CaptureFace — one face scheduled this frame: the synthetic camera it draws
 * through and the body rows it draws. A sky face draws none; a probe face
 * draws its subject's host, so the probe sees the body it lights.
 */

import type { FrameView } from './FrameView';

export type CaptureFace = {
  readonly ctx: FrameView;
  /** Body-m slab indices IN `ctx.slabs` to expand `bodyPasses` over; `[]` for a sky row. */
  readonly bodySlabs: readonly number[];
};
