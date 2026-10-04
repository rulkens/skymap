/**
 * cameraFraming — the bootstrap camera constants: the clip planes and
 * default FOV the orbit camera's projection needs, plus the neutral
 * Local-Group pose `homePose` falls back to for a home-less composition.
 *
 * ### Constants
 *
 *   - `FAR_CLIP_MPC = 80000` — far-clip plane.  Sized so the entire
 *     observable-universe horizon shell (radius 14 300 Mpc, drawn by
 *     `horizonShellRenderer`) stays inside the frustum at every
 *     reachable camera distance: max_cam 60 000 + shell 14 300 =
 *     74 300 Mpc, plus headroom.  Visual pass uses additive blending
 *     with no depth test, so depth precision is not a concern; the
 *     pick pass uses depth32float, which handles the 0.01 : 80 000
 *     ratio fine.
 *   - `NEAR_CLIP_MPC = 0.01` (10 kpc) — well inside the focus-on tween's
 *     end distance (0.12 Mpc, see `galaxyFocusDistance.ts`).
 *   - `INITIAL_DISTANCE_MPC` — a Local-Group-scale distance the wheel-zoom
 *     envelope + the grand tour still reference; no longer the boot distance.
 *   - `GALACTIC_DISC_FORWARD` — the eye-tuned WORLD-space direction that faces
 *     the galactic disk. The grand tour's opening and closing beats aim along
 *     it (via `aimAlong`, resolved live) instead of the app booting there.
 */

import type { Vec3 } from '../../../@types/math/Vec3';
import { DEFAULT_FOV_DEG } from '../../../data/defaults';

/** Initial camera distance in Mpc — sits the viewer inside the Local Group. */
export const INITIAL_DISTANCE_MPC = 0.14;

/** Near-clip plane in Mpc; the one home for the literal every projection seed shares. */
export const NEAR_CLIP_MPC = 0.01;

/** Far-clip plane in Mpc — keeps the horizon shell in-frustum at max camera distance. */
export const FAR_CLIP_MPC = 80000;

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
