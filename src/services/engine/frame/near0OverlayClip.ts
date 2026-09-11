/**
 * near0OverlayClip — NEAR0 overlay matrices, rescaled to emit clip METRES.
 * NDC and depth are invariant under a uniform clip scale; any world length a
 * consumer divides by that `w` must carry the same factor.
 * Derivation: docs/RENDERER.md, "NEAR0 overlay clip `w` must stay ≫ 1e-20".
 */

import { SCALE_UNITS } from '../../../data/scaleUnits';
import { narrowMat4 } from '../../../utils/math/narrowMat4';

export const NEAR0_OVERLAY_CLIP_SCALE = SCALE_UNITS.MPC_TO_M;

export function near0OverlayVpF32(vp: Float64Array): Float32Array {
  // Scaled in f64 and narrowed once — scaling the f32 result instead would
  // round twice.
  const scaled = new Float64Array(16);
  for (let i = 0; i < 16; i++) scaled[i] = vp[i]! * NEAR0_OVERLAY_CLIP_SCALE;
  return narrowMat4(scaled);
}
