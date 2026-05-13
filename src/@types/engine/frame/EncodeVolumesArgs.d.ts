/**
 * EncodeVolumesArgs — inputs for `encodeVolumes()`.
 *
 * Why a named arg-bag (vs positional args) — same rationale as the rest of
 * the frame-encoder helpers in this directory: the caller threads ~6
 * values through one indirection site, and a struct keeps the call shape
 * legible and easy to extend without ordering surprises.  See
 * `RenderFrameInput.d.ts` for the matching argument-bag pattern.
 */

import type { ReadyFrameContext } from './ReadyFrameContext';
import type { ScalarVolumeRenderer } from '../../rendering/ScalarVolumeRenderer';

export type EncodeVolumesArgs = {
  encoder: GPUCommandEncoder;
  ctx: ReadyFrameContext;
  /**
   * Scalar-volume renderer.  Null in the brief bootstrap window before
   * `initGpu` has wired it up; the helper is a no-op in that case.
   */
  scalarVolumeRenderer: ScalarVolumeRenderer | null;
  /**
   * Optional `RenderPassTimestampWrites` for per-pass GPU timing.  When
   * `undefined` the helper omits the field from the `beginRenderPass`
   * descriptor (single-pass production path).  When defined the helper
   * spreads it in — used by `encodeHdrSplit` to bill the half-res
   * raymarch against the `'scalar-volume'` slot.
   */
  timestampWrites: GPURenderPassTimestampWrites | undefined;
};
