/**
 * near0OverlayClip — the NEAR0 overlays (captions, leader lines, selection
 * ring) anchor in eye-relative Mpc, so a body 31 m away projects to clip
 * `w ≈ 1e-21`, and the rasterizer floors `w` near 1e-20 (≈ 309 m at these
 * units): the overlay then shrinks uniformly about the screen centre, worse
 * the closer you get. Clip is homogeneous, so scaling the whole matrix moves
 * `w` with `x/y/z` and leaves NDC exact — these matrices emit clip METRES.
 * Any world length divided by that `w` must carry the same factor: the label
 * em (`createLabelRenderer`'s `clipScale`, wired in `gpuHandleRegistry`) and
 * the ring's near-plane pin.
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
