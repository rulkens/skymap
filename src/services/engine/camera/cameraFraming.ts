/**
 * cameraFraming — pure helper that produces the engine's initial camera
 * snapshot. Pure constants; no dependency on loaded data so the camera
 * can be built before any survey has arrived.
 *
 * ### Constants
 *
 *   - `INITIAL_DISTANCE_MPC` — wheel-zoom start point, clamped to the
 *     global zoom envelope.
 *   - `FAR_CLIP_MPC = 50000` — far-clip plane.  Sized so the entire
 *     observable-universe horizon shell (radius 14 300 Mpc, drawn by
 *     `horizonShellRenderer`) stays inside the frustum at every
 *     reachable camera distance: max_cam 30 000 + shell 14 300 =
 *     44 300 Mpc, plus headroom.  Visual pass uses additive blending
 *     with no depth test, so depth precision is not a concern; the
 *     pick pass uses depth32float, which handles the 0.01 : 50 000
 *     ratio fine.
 *   - `near = 0.01` Mpc (10 kpc) — well inside the focus-on tween's
 *     end distance (0.12 Mpc, see `galaxyFocusDistance.ts`).
 *   - `yaw ≈ 3.00`, `pitch ≈ 0.06` — nearly looking down the −Z axis
 *     with a near-flat pitch, framing the Local Group at first paint.
 */

import { clampDistance } from '../../camera/orbitCamera';
import type { InitialCam } from '../../../@types/camera/InitialCam';

/** Initial camera distance in Mpc — sits the viewer inside the Local Group. */
export const INITIAL_DISTANCE_MPC = 0.43;

/** Far-clip plane in Mpc — keeps the horizon shell in-frustum at max camera distance. */
export const FAR_CLIP_MPC = 50000;

/**
 * Compute the initial camera snapshot. Pure constants — no dependency on
 * loaded catalogs, so the camera can be built before any survey arrives.
 *
 * @param fovYRad  Vertical field-of-view in radians (e.g. 60° → π/3).
 */
export function computeInitialCamera({ fovYRad }: { fovYRad: number }): InitialCam {
  return {
    target: [0, 0, 0],
    distance: clampDistance(INITIAL_DISTANCE_MPC),
    yaw: 3.0045,
    pitch: 0.0609,
    fovYRad,
    near: 0.01,
    far: FAR_CLIP_MPC,
  };
}
