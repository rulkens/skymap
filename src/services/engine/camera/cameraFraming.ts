/**
 * cameraFraming — pure helper that produces the engine's initial camera
 * snapshot. Pure constants; no dependency on loaded data so the camera
 * can be built before any galaxy catalog has arrived.
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
 *   - `BOOT_YAW_RAD` / `BOOT_PITCH_RAD` — the Milky-Way framing the app
 *     boots with, looking at the galactic disk at first paint. Exported
 *     because the grand tour's opening snaps to the same bearing, so a
 *     tour run always approaches home from the boot orientation.
 */

import { clampDistance } from '../../../utils/camera/clampDistance';
import type { InitialCam } from '../../../@types/camera/InitialCam';

/** Initial camera distance in Mpc — sits the viewer inside the Local Group. */
export const INITIAL_DISTANCE_MPC = 0.14;

/** Far-clip plane in Mpc — keeps the horizon shell in-frustum at max camera distance. */
export const FAR_CLIP_MPC = 50000;

/** Default vertical field-of-view in radians (60°) — the bootstrap lens setting. */
export const DEFAULT_FOV_Y_RAD = (Math.PI / 180) * 60;

/** Boot orientation — eye-tuned to face the galactic disk at first paint. */
export const BOOT_YAW_RAD = 4.4889;
export const BOOT_PITCH_RAD = -0.0644;

/**
 * Compute the initial camera snapshot. Pure constants — no dependency on
 * loaded catalogs, so the camera can be built before any galaxy catalog arrives.
 *
 * @param fovYRad  Vertical field-of-view in radians (e.g. 60° → π/3).
 */
export function computeInitialCamera({ fovYRad }: { fovYRad: number }): InitialCam {
  return {
    target: [0, 0, 0],
    distance: clampDistance(INITIAL_DISTANCE_MPC),
    yaw: BOOT_YAW_RAD,
    pitch: BOOT_PITCH_RAD,
    fovYRad,
    near: 0.01,
    far: FAR_CLIP_MPC,
  };
}
