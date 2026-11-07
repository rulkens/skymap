/**
 * viewCornerRays — the four corner rays of a view in world axes: `rayThroughPx`
 * at the canvas's outer pixel corners. Directions only: no position enters, so
 * no Mpc-scale value is ever narrowed.
 */

import type { ViewBasis } from '../../../@types/camera/projection/ViewBasis';
import type { ViewFrustum } from '../../../@types/camera/projection/ViewFrustum';
import type { ViewCornerRays } from '../../../@types/camera/projection/ViewCornerRays';
import type { Size } from '../../../@types/rendering/Size';
import { rayThroughPx } from './rayThroughPx';

export function viewCornerRays(basis: ViewBasis, frustum: ViewFrustum, size: Size): ViewCornerRays {
  const { width: w, height: h } = size;
  return {
    tl: rayThroughPx([0, 0], basis, frustum, size),
    tr: rayThroughPx([w, 0], basis, frustum, size),
    bl: rayThroughPx([0, h], basis, frustum, size),
    br: rayThroughPx([w, h], basis, frustum, size),
  };
}
