/**
 * Push a camera-relative centre out until its clip `w` clears `nearClipW` —
 * read off the given vp, not the centre's LENGTH, since the two differ by the
 * off-axis cosine and clipping tests the depth. The threshold is the near plane
 * expressed in THAT vp's clip units, which for the NEAR0 overlays are metres
 * (`near0OverlayClip`), not the slab's Mpc. A centre behind the eye (`w <= 0`)
 * is left alone: scaling by a negative ratio would fold it into view.
 */

import type { Vec3 } from '../../@types/math/Vec3';

/** Where the pin lands, as a multiple of `nearClipW`: a hair inside the plane,
 *  so f32 rounding of the narrowed vp cannot tip the boundary case back out. */
const NEAR_PIN_MARGIN = 1.001;

export function pinInsideNearPlane(centre: Vec3, vp: Float32Array, nearClipW: number): Vec3 {
  const w = vp[3]! * centre[0] + vp[7]! * centre[1] + vp[11]! * centre[2] + vp[15]!;
  if (w <= 0 || w >= nearClipW) return centre;
  const s = (nearClipW * NEAR_PIN_MARGIN) / w;
  return [centre[0] * s, centre[1] * s, centre[2] * s];
}
