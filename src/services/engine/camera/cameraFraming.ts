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
 *   - `GALACTIC_DISC_FORWARD` — the eye-tuned WORLD-space direction that faces
 *     the galactic disk. The grand tour's opening and closing beats aim along
 *     it (via `aimAlong`, resolved live) instead of the app booting there.
 */

import type { InitialCam } from '../../../@types/camera/InitialCam';
import type { Mat3 } from '../../../@types/math/Mat3';
import type { Vec3 } from '../../../@types/math/Vec3';
import { earthHomePose } from './earthHomePose';
import { DEFAULT_FOV_DEG } from '../../../data/defaults';

/** Initial camera distance in Mpc — sits the viewer inside the Local Group. */
export const INITIAL_DISTANCE_MPC = 0.14;

/** Far-clip plane in Mpc — keeps the horizon shell in-frustum at max camera distance. */
export const FAR_CLIP_MPC = 50000;

/** Bootstrap lens in radians — derived from the `settings.camera.fovDeg` default so boot and slider rest position can't drift apart. */
export const DEFAULT_FOV_Y_RAD = (Math.PI / 180) * DEFAULT_FOV_DEG;

/**
 * Eye-tuned WORLD-space direction that faces the galactic disk — aimed along
 * by the tour's opening/closing beats via `aimAlong` (`orbitAnglesLookingAlong`
 * resolves it through whichever orientation frame is live, so it decodes to
 * the same world direction under any frame). Points the same way the legacy
 * ecliptic-frame angle pair `(yaw: -1.4208, pitch: -0.1783)` did — magnitude is
 * irrelevant, `orbitAnglesLookingAlong` normalises.
 */
export const GALACTIC_DISC_FORWARD: Vec3 = [0.973096, 0.064379, 0.221222];

/**
 * Compute the initial camera snapshot: the Earth home pose at boot time wrapped
 * in the near/far/fov envelope. Pure function of `simDays` — the ephemeris is
 * analytic, so no dependency on loaded catalogs and the camera can be built
 * before any galaxy catalog arrives.
 *
 * @param fovYRad     Vertical field-of-view in radians (e.g. 60° → π/3).
 * @param simDays     Boot sim instant (Julian days) — where Earth is at load.
 * @param frameBasis  The committed orientation basis
 *   (`ORIENTATION_FRAMES[settings.orientation]`) the boot pose encodes through,
 *   so first-paint yaw/pitch round-trip under the same frame the render path
 *   decodes with. Absent ⇒ identity (world-frame angles). See `earthHomePose`.
 */
export function computeInitialCamera({
  fovYRad,
  simDays,
  frameBasis,
}: {
  fovYRad: number;
  simDays: number;
  frameBasis?: Mat3;
}): InitialCam {
  // The home distance is `bodyLikeFraming`'s deliberately UNCLAMPED Earth-scale
  // value — no `clampDistance` here: it takes a pivot radius the boot pose
  // hasn't resolved yet, and the absolute floor alone would swallow the framing
  // at ~2e-16 Mpc. The wheel-zoom clamps own the floor; see `bodyLikeFraming`.
  return {
    ...earthHomePose(simDays, fovYRad, frameBasis),
    fovYRad,
    near: 0.01,
    far: FAR_CLIP_MPC,
  };
}
