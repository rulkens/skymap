/**
 * cameraFraming — pure helper that produces the engine's initial camera
 * snapshot. The pose is a pure FUNCTION of boot time (the caller supplies
 * `simDays`); the ephemeris behind it is analytic, so there is still no
 * dependency on loaded or fetched data and the camera can be built before any
 * galaxy catalog has arrived.
 *
 * ### The boot pose IS the home pose
 *
 * The app boots into the same Earth home framing every home entry point
 * converges on: `earthHomePose(simDays, fovYRad)` supplies target / yaw / pitch
 * / distance, and this helper wraps it in the near/far/fov envelope the orbit
 * camera needs. Booting to the home pose means the Home pill / `h` key never
 * fly the camera away from where it already sits right after load.
 *
 * ### Constants
 *
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
 *   - `INITIAL_DISTANCE_MPC` — a Local-Group-scale distance the wheel-zoom
 *     envelope + the grand tour still reference; no longer the boot distance.
 *   - `GALACTIC_DISC_YAW_RAD` / `GALACTIC_DISC_PITCH_RAD` — the eye-tuned
 *     bearing that faces the galactic disk. The grand tour's opening and
 *     closing beats aim at this bearing (the app now boots at Earth instead).
 */

import type { InitialCam } from '../../../@types/camera/InitialCam';
import { earthHomePose } from './earthHomePose';

/** Initial camera distance in Mpc — sits the viewer inside the Local Group. */
export const INITIAL_DISTANCE_MPC = 0.14;

/** Far-clip plane in Mpc — keeps the horizon shell in-frustum at max camera distance. */
export const FAR_CLIP_MPC = 50000;

/** Default vertical field-of-view in radians (60°) — the bootstrap lens setting. */
export const DEFAULT_FOV_Y_RAD = (Math.PI / 180) * 60;

/** Eye-tuned bearing that faces the galactic disk — aimed at by the tour's opening/closing beats. */
export const GALACTIC_DISC_YAW_RAD = 4.4889;
export const GALACTIC_DISC_PITCH_RAD = -0.0644;

/**
 * Compute the initial camera snapshot: the Earth home pose at boot time wrapped
 * in the near/far/fov envelope. Pure function of `simDays` — the ephemeris is
 * analytic, so no dependency on loaded catalogs and the camera can be built
 * before any galaxy catalog arrives.
 *
 * @param fovYRad  Vertical field-of-view in radians (e.g. 60° → π/3).
 * @param simDays  Boot sim instant (Julian days) — where Earth is at load.
 */
export function computeInitialCamera({
  fovYRad,
  simDays,
}: {
  fovYRad: number;
  simDays: number;
}): InitialCam {
  // The home distance is `bodyLikeFraming`'s deliberately UNCLAMPED Earth-scale
  // value — no `clampDistance` here: at ~2e-16 Mpc the Mpc-scale clamp floor
  // would swallow the framing. The wheel-zoom clamps own the floor
  // (MIN_DISTANCE_MPC reaches Earth-surface scale); see `bodyLikeFraming`.
  return {
    ...earthHomePose(simDays, fovYRad),
    fovYRad,
    near: 0.01,
    far: FAR_CLIP_MPC,
  };
}
