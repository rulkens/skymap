/**
 * near0OverlayVpF32 — a NEAR0 overlay view-projection rescaled to emit clip
 * METRES and narrowed to f32; see `NEAR0_OVERLAY_CLIP_SCALE` for why.
 */

import { narrowMat4 } from '../../../utils/math/narrowMat4';

export function near0OverlayVpF32(vp: Float64Array, clipScale: number): Float32Array {
  // Scaled in f64 and narrowed once — scaling the f32 result instead would
  // round twice.
  const scaled = new Float64Array(16);
  for (let i = 0; i < 16; i++) scaled[i] = vp[i]! * clipScale;
  return narrowMat4(scaled);
}
