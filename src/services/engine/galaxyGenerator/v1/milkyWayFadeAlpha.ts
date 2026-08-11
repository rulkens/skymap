/**
 * milkyWayFadeAlpha — apparent-size fade for the Milky Way point cloud: at a
 * few on-screen pixels the star sprites collapse into an aliased shimmer,
 * and there is no catalog row at the origin to hand off to, so it fades to
 * nothing.
 *
 * Keyed to the disc's APPARENT DIAMETER in pixels, not camera distance — a
 * distance band fires too early on a wide fov and too late on a narrow one.
 * Alpha RISES with apparent size (`smoothstep(gone, full, px)`, no 1-minus):
 * full strength close up, zero far away. Band edges live in
 * `milkyWayCalibration.ts` (`MILKY_WAY_FADE_FULL_PX` / `_GONE_PX`).
 *
 * Non-positive `camDistMpc` clamps to a tiny positive floor inside
 * `apparentDiameterPx`, yielding full alpha — read as "camera is inside the
 * disc", not a divide-by-zero bug.
 */

import { apparentDiameterPx } from '../../../../utils/math/apparentDiameterPx';
import { smoothstep } from '../../../../utils/math/smoothstep';
import {
  MILKY_WAY_FADE_FULL_PX,
  MILKY_WAY_FADE_GONE_PX,
  MILKY_WAY_RADIUS_MPC,
} from './milkyWayCalibration';

export function milkyWayFadeAlpha(
  camDistMpc: number,
  fovYRad: number,
  viewportHeightPx: number,
): number {
  const px = apparentDiameterPx(2 * MILKY_WAY_RADIUS_MPC, camDistMpc, fovYRad, viewportHeightPx);
  return smoothstep(MILKY_WAY_FADE_GONE_PX, MILKY_WAY_FADE_FULL_PX, px);
}
