/**
 * milkyWayFadeAlpha — apparent-size fade for the Milky Way point cloud.
 *
 * The cloud is a foreground feature, not a catalog point: once the camera
 * pulls far enough away that the disc shrinks to a few on-screen pixels,
 * the star sprites collapse into an aliased shimmer, and there is no SDSS
 * row at the origin for it to hand off to — so it fades to nothing.
 *
 * The fade is keyed to the disc's APPARENT DIAMETER in pixels, not to a
 * camera-distance band: a distance band fires too early on a wide fov or a
 * tall window and too late on a narrow one, while an apparent-size band
 * tracks what the user actually sees on any viewport. The band edges live
 * with the rest of the visual-gate knobs in `milkyWayCalibration.ts`
 * (`MILKY_WAY_FADE_FULL_PX` / `MILKY_WAY_FADE_GONE_PX`).
 *
 * Alpha RISES with apparent size (`smoothstep(gone, full, px)` — no
 * 1-minus): a close camera sees a big disc and full strength, a distant
 * camera sees a speck and nothing. The smoothstep keeps a slow fly-out
 * pop-free, and matching the shader built-in keeps any future GPU-side
 * fade in step. Sibling regime to `horizonShellFadeAlpha`, which fades IN
 * over the far distance band.
 *
 * Returns a number in `[0, 1]`:
 *   - `1.0` when the disc's apparent diameter ≥ `MILKY_WAY_FADE_FULL_PX`.
 *   - `0.0` when it is ≤ `MILKY_WAY_FADE_GONE_PX`.
 *   - Smoothstepped between.
 *
 * Non-positive `camDistMpc` (defensive — a real camera distance is
 * `length(camPos) ≥ 0`) clamps to a tiny positive floor inside
 * `apparentDiameterPx`, yielding an enormous apparent size and therefore
 * full alpha — the camera is inside the disc, not past it.
 */

import { apparentDiameterPx } from '../../../utils/math/apparentDiameterPx';
import { smoothstep } from '../../../utils/math/smoothstep';
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
